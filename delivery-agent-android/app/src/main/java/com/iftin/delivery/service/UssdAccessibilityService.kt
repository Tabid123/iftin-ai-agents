package com.iftin.delivery.service

import android.accessibilityservice.AccessibilityService
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Drives Android's USSD dialog for *870*, *866*, *101* and *212*.
 * The selection logic lives in UssdMenuFlow and was adapted from Riyokaab_App.
 */
class UssdAccessibilityService : AccessibilityService() {
    companion object {
        private const val TAG = "IftinUssdAccess"
        private var lastActionAt = 0L
        private var lastFingerprint = ""
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (!UssdMenuFlow.isActive(this)) return
        val roots = buildList {
            rootInActiveWindow?.let(::add)
            windows?.forEach { it.root?.let(::add) }
        }
        if (roots.isEmpty()) return

        val dialogText = roots.asSequence()
            .map(::collectText)
            .filter(String::isNotBlank)
            .maxByOrNull(String::length)
            .orEmpty()
        if (!UssdMenuFlow.isUssdDialogText(dialogText)) return

        // Discovery stops at the package menu and optionally keeps the carrier session open.
        if (UssdMenuFlow.isDiscoveryMode(this) && UssdMenuFlow.isPackageMenuDialog(dialogText)) {
            UssdMenuFlow.saveDiscoveryMenu(this, dialogText)
            DeliveryService.signalDiscoveryCaptured(this, dialogText)
            if (!UssdMenuFlow.isHoldSession(this)) {
                clickCancel(roots)
                UssdMenuFlow.finish(this)
            }
            return
        }

        val step = UssdMenuFlow.matchStep(this, dialogText)
        if (step != null) {
            val input = UssdMenuFlow.inputFor(this, step, dialogText)
            if (input.isBlank()) {
                Log.e(TAG, "Unsafe/empty selection for ${step.name}; refusing default purchase")
                DeliveryService.signalUssdResult(this, false, "Selection not found: ${step.name}\n$dialogText")
                clickCancel(roots)
                UssdMenuFlow.finish(this)
                return
            }

            val fingerprint = "${step.order}:$input:${dialogText.take(240)}"
            val now = System.currentTimeMillis()
            if (fingerprint == lastFingerprint && now - lastActionAt < 900) return

            if (setInputAndSend(roots, input)) {
                lastFingerprint = fingerprint
                lastActionAt = now
                UssdMenuFlow.markStepCompleted(this, step.order)
                Log.d(TAG, "USSD step ${step.name} -> $input")
            }
            return
        }

        // No known menu step remains: classify final carrier response.
        val lower = dialogText.lowercase()
        val success = listOf(
            "success", "successful", "ugu shubtay", "u shubtay", "haraagaagu waa",
            "ku guulaysatay", "completed", "activated", "transcation id", "transaction id"
        ).any(lower::contains)
        val failure = listOf(
            "failed", "khalad", "error", "insufficient", "invalid", "declined",
            "rejected", "service error", "try again", "horey furtay"
        ).any(lower::contains)

        if (success || failure) {
            DeliveryService.signalUssdResult(this, success && !failure, dialogText)
            UssdMenuFlow.finish(this)
            clickDismiss(roots)
        }
    }

    override fun onInterrupt() = Unit

    private fun collectText(root: AccessibilityNodeInfo): String {
        val values = mutableListOf<String>()
        fun walk(node: AccessibilityNodeInfo?) {
            if (node == null) return
            node.text?.toString()?.trim()?.takeIf(String::isNotEmpty)?.let(values::add)
            node.contentDescription?.toString()?.trim()?.takeIf(String::isNotEmpty)?.let(values::add)
            for (i in 0 until node.childCount) walk(node.getChild(i))
        }
        walk(root)
        return values.distinct().joinToString(" | ")
    }

    private fun setInputAndSend(roots: List<AccessibilityNodeInfo>, input: String): Boolean {
        val editable = roots.asSequence().mapNotNull(::findEditable).firstOrNull() ?: return false
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, input)
        }
        editable.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        val set = editable.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        if (!set) return false

        // Give the phone dialog a moment to observe ACTION_SET_TEXT before Send.
        editable.postDelayedCompat(120) {
            roots.asSequence().mapNotNull { findButton(it, listOf("send", "dir", "ok")) }.firstOrNull()
                ?.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        }
        return true
    }

    private fun findEditable(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (root.isEditable || root.className?.toString()?.contains("EditText") == true) return root
        for (i in 0 until root.childCount) {
            findEditable(root.getChild(i))?.let { return it }
        }
        return null
    }

    private fun findButton(root: AccessibilityNodeInfo, words: List<String>): AccessibilityNodeInfo? {
        val text = "${root.text.orEmpty()} ${root.contentDescription.orEmpty()}".lowercase()
        if (root.isClickable && words.any(text::contains)) return root
        for (i in 0 until root.childCount) {
            findButton(root.getChild(i), words)?.let { return it }
        }
        return null
    }

    private fun clickCancel(roots: List<AccessibilityNodeInfo>) {
        roots.asSequence().mapNotNull { findButton(it, listOf("cancel", "jooji")) }.firstOrNull()
            ?.performAction(AccessibilityNodeInfo.ACTION_CLICK)
    }

    private fun clickDismiss(roots: List<AccessibilityNodeInfo>) {
        roots.asSequence().mapNotNull { findButton(it, listOf("ok", "close", "xir", "cancel")) }.firstOrNull()
            ?.performAction(AccessibilityNodeInfo.ACTION_CLICK)
    }

    private fun AccessibilityNodeInfo.postDelayedCompat(delayMs: Long, block: () -> Unit) {
        android.os.Handler(mainLooper).postDelayed(block, delayMs)
    }
}
