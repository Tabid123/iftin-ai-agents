package com.iftin.delivery.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Drives Android USSD dialogs for *870*, *866*, *101* and *212*.
 *
 * Carrier/menu selection rules live in UssdMenuFlow. Interaction behaviour is
 * intentionally aligned with Riyokaab's proven Android agent: live-window scanning,
 * Samsung/STK polling, exact-input verification, visible digit-key fallback,
 * delayed Send retries, hold/resume and stale-dialog protection.
 */
class UssdAccessibilityService : AccessibilityService() {
    companion object {
        private const val TAG = "IftinUssdAccess"
        private const val INPUT_SETTLE_MS = 1000L
        private const val ACTIVE_POLL_MS = 200L
        private const val HOLD_POLL_MS = 450L
        private const val IDLE_POLL_MS = 900L
        private const val RETRY_GUARD_MS = 1200L
        private const val SEND_RETRY_MS = 200L
        private const val MAX_SEND_RETRIES = 20

        @Volatile private var instance: UssdAccessibilityService? = null
        @Volatile private var holdAwaitingSelection = false

        fun closeUssdSession() {
            instance?.closeCurrentSession()
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var watcher: Runnable? = null
    private var actionInFlight = false
    private var actionStep = -1
    private var lastFingerprint = ""
    private var lastActionAt = 0L
    private var lastSeenActive = false

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        serviceInfo = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED or
                AccessibilityEvent.TYPE_WINDOWS_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or
                AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            notificationTimeout = 10
        }
        startWatcher()
        Log.d(TAG, "Accessibility connected; live USSD watcher active")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (!UssdMenuFlow.isActive(this) && !holdAwaitingSelection) return
        handler.postDelayed({ driveLiveDialog() }, 100L)
    }

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        watcher?.let(handler::removeCallbacks)
        watcher = null
        instance = null
        actionInFlight = false
        super.onDestroy()
    }

    private fun startWatcher() {
        if (watcher != null) return
        lateinit var loop: Runnable
        loop = Runnable {
            val active = UssdMenuFlow.isActive(this)
            if (active && !UssdMenuFlow.isDiscoveryMode(this) && holdAwaitingSelection) {
                holdAwaitingSelection = false
                Log.d(TAG, "Held *212 session re-armed; resuming existing live dialog")
            }
            if (active) {
                if (!lastSeenActive) {
                    actionInFlight = false
                    actionStep = -1
                    lastFingerprint = ""
                }
                driveLiveDialog()
            }
            lastSeenActive = active
            handler.postDelayed(loop, when {
                active -> ACTIVE_POLL_MS
                holdAwaitingSelection -> HOLD_POLL_MS
                else -> IDLE_POLL_MS
            })
        }
        watcher = loop
        handler.post(loop)
    }

    private fun driveLiveDialog() {
        if (holdAwaitingSelection || !UssdMenuFlow.isActive(this)) return
        val root = obtainBestUssdRoot() ?: return
        val dialogText = collectText(root)
        if (!UssdMenuFlow.isUssdDialogText(dialogText)) return

        if (UssdMenuFlow.isDiscoveryMode(this) && UssdMenuFlow.isPackageMenuDialog(dialogText)) {
            UssdMenuFlow.saveDiscoveryMenu(this, dialogText)
            DeliveryService.signalDiscoveryCaptured(this, dialogText)
            if (UssdMenuFlow.isHoldSession(this)) {
                holdAwaitingSelection = true
                UssdMenuFlow.deactivate(this)
                actionInFlight = false
                actionStep = -1
                Log.d(TAG, "Discovery package menu captured; carrier session held open")
            } else {
                clickCancel(root)
                UssdMenuFlow.finish(this)
            }
            return
        }

        val step = UssdMenuFlow.matchStep(this, dialogText)
        if (step != null) {
            if (actionInFlight) return
            val input = UssdMenuFlow.inputFor(this, step, dialogText)
            if (input.isBlank()) {
                Log.e(TAG, "Unsafe/empty selection for ${step.name}; refusing default purchase")
                DeliveryService.signalUssdResult(this, false, "Selection not found: ${step.name}\n$dialogText")
                clickCancel(root)
                UssdMenuFlow.finish(this)
                return
            }

            val fingerprint = "${step.order}:$input:${dialogText.take(220)}"
            val now = System.currentTimeMillis()
            if (fingerprint == lastFingerprint && now - lastActionAt < RETRY_GUARD_MS) return
            actionInFlight = true
            actionStep = step.order
            lastFingerprint = fingerprint
            lastActionAt = now

            if (!enterInput(root, input)) {
                clearAction(step.order, allowImmediateRetry = true)
                return
            }
            handler.postDelayed({ verifyAndSubmit(step.order, input) }, INPUT_SETTLE_MS)
            return
        }

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
            actionInFlight = false
            actionStep = -1
            DeliveryService.signalUssdResult(this, success && !failure, dialogText)
            UssdMenuFlow.finish(this)
            clickDismiss(root)
        }
    }

    private fun verifyAndSubmit(expectedStep: Int, input: String) {
        if (!UssdMenuFlow.isActive(this) || holdAwaitingSelection || actionStep != expectedStep) {
            clearAction(expectedStep)
            return
        }
        val root = obtainBestUssdRoot() ?: run {
            clearAction(expectedStep, allowImmediateRetry = true)
            return
        }
        val liveText = collectText(root)
        val liveStep = UssdMenuFlow.matchStep(this, liveText)
        if (liveStep?.order != expectedStep) {
            Log.w(TAG, "Dialog changed before Send: expected=$expectedStep live=${liveStep?.order}")
            clearAction(expectedStep, allowImmediateRetry = true)
            return
        }

        if (!verifyInput(root, input)) {
            val retryEntered = if (input.all(Char::isDigit)) {
                Log.w(TAG, "Input not visible; using Riyokaab-style visible digit fallback")
                typeDigitsViaAccessibility(root, input)
            } else {
                enterInput(root, input)
            }
            if (!retryEntered) {
                clearAction(expectedStep, allowImmediateRetry = true)
                return
            }
            handler.postDelayed({ verifyAndSubmitSecondPass(expectedStep, input) }, INPUT_SETTLE_MS)
            return
        }
        submitStep(root, expectedStep, input)
    }

    private fun verifyAndSubmitSecondPass(expectedStep: Int, input: String) {
        val root = obtainBestUssdRoot() ?: run {
            clearAction(expectedStep, allowImmediateRetry = true)
            return
        }
        val liveStep = UssdMenuFlow.matchStep(this, collectText(root))
        if (liveStep?.order != expectedStep || !verifyInput(root, input)) {
            Log.e(TAG, "Input verification failed twice; Send blocked for safety")
            clearAction(expectedStep, allowImmediateRetry = true)
            return
        }
        submitStep(root, expectedStep, input)
    }

    private fun submitStep(root: AccessibilityNodeInfo, expectedStep: Int, input: String, attempt: Int = 0) {
        if (clickSendAcrossWindows(root)) {
            UssdMenuFlow.markStepCompleted(this, expectedStep)
            Log.d(TAG, "USSD step $expectedStep submitted")
            clearAction(expectedStep)
            handler.postDelayed({ if (UssdMenuFlow.isActive(this)) driveLiveDialog() }, 350L)
            return
        }

        if (attempt >= MAX_SEND_RETRIES) {
            Log.e(TAG, "Verified input but Send stayed unavailable for step $expectedStep")
            clearAction(expectedStep, allowImmediateRetry = true)
            return
        }

        handler.postDelayed({
            if (!UssdMenuFlow.isActive(this) || actionStep != expectedStep) {
                clearAction(expectedStep)
                return@postDelayed
            }
            val liveRoot = obtainBestUssdRoot() ?: run {
                clearAction(expectedStep, allowImmediateRetry = true)
                return@postDelayed
            }
            val liveStep = UssdMenuFlow.matchStep(this, collectText(liveRoot))
            if (liveStep?.order == expectedStep && verifyInput(liveRoot, input)) {
                submitStep(liveRoot, expectedStep, input, attempt + 1)
            } else {
                Log.w(TAG, "Dialog changed while waiting for Send; step will be re-evaluated")
                clearAction(expectedStep, allowImmediateRetry = true)
            }
        }, SEND_RETRY_MS)
    }

    private fun clearAction(step: Int, allowImmediateRetry: Boolean = false) {
        if (actionStep == step) {
            actionInFlight = false
            actionStep = -1
        }
        if (allowImmediateRetry) {
            lastFingerprint = ""
            lastActionAt = 0L
        }
    }

    private fun obtainBestUssdRoot(): AccessibilityNodeInfo? {
        val roots = mutableListOf<AccessibilityNodeInfo>()
        rootInActiveWindow?.let(roots::add)
        try { windows?.forEach { window -> window.root?.let(roots::add) } } catch (_: Throwable) {}
        if (roots.isEmpty()) return null
        return roots.distinctBy { System.identityHashCode(it) }
            .map { it to collectText(it) }
            .filter { (_, text) -> UssdMenuFlow.isUssdDialogText(text) }
            .maxByOrNull { (root, text) -> scoreRoot(root, text) }?.first
    }

    private fun scoreRoot(root: AccessibilityNodeInfo, text: String): Int {
        val lower = text.lowercase()
        var score = text.length.coerceAtMost(240) / 20
        if (UssdMenuFlow.isUssdDialogText(text)) score += 500
        if (UssdMenuFlow.isPackageMenuDialog(text)) score += 300
        if (UssdMenuFlow.parseMenuItems(text).isNotEmpty()) score += 220
        if (lower.contains("mudnaan")) score += 140
        if (lower.contains("pin") || lower.contains("furaha") || lower.contains("password")) score += 140
        if (lower.contains("send") || lower.contains("dir") || lower.contains("ok")) score += 45
        if (hasEditable(root)) score += 35
        val pkg = root.packageName?.toString()?.lowercase().orEmpty()
        if (pkg.contains("inputmethod") || pkg.contains("keyboard") || pkg.contains("gboard")) score -= 500
        if (lower.contains("english (uk)") || lower.contains("english (us)") || lower.contains("q | w | e") || lower.contains("!#1")) score -= 250
        return score
    }

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

    private fun enterInput(root: AccessibilityNodeInfo, input: String): Boolean {
        val editable = findEditable(root)
        if (editable == null) return if (input.all(Char::isDigit)) typeDigitsViaAccessibility(root, input) else false

        editable.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        editable.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, input)
        }
        var success = editable.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        if (!success) {
            try {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("ussd_input", input))
                success = editable.performAction(AccessibilityNodeInfo.ACTION_PASTE)
                Log.d(TAG, "Paste fallback for USSD input success=$success")
            } catch (e: Throwable) {
                Log.w(TAG, "Paste fallback failed: ${e.message}")
            }
        }
        if (!success && input.all(Char::isDigit)) return typeDigitsViaAccessibility(root, input)
        return success
    }

    private fun verifyInput(root: AccessibilityNodeInfo, expected: String): Boolean {
        val normalizedExpected = expected.replace('\u00A0', ' ').trim()
        val expectedDigits = normalizedExpected.filter(Char::isDigit)
        fun walk(node: AccessibilityNodeInfo?): Boolean {
            if (node == null) return false
            val isField = node.isEditable || node.className?.toString()?.contains("EditText", ignoreCase = true) == true
            if (isField && node.isVisibleToUser) {
                val value = node.text?.toString().orEmpty().replace('\u00A0', ' ').trim()
                val actualDigits = value.filter(Char::isDigit)
                if (value == normalizedExpected ||
                    (expectedDigits.isNotEmpty() && actualDigits == expectedDigits) ||
                    (node.isPassword && value.length == normalizedExpected.length)
                ) return true
            }
            for (i in 0 until node.childCount) if (walk(node.getChild(i))) return true
            return false
        }
        if (walk(root)) return true
        try {
            rootInActiveWindow?.let { if (walk(it)) return true }
            windows?.forEach { window -> if (walk(window.root)) return true }
        } catch (_: Throwable) {}
        return false
    }

    private fun typeDigitsViaAccessibility(root: AccessibilityNodeInfo, value: String): Boolean {
        val digits = value.filter(Char::isDigit)
        if (digits.isEmpty()) return false
        var typedAny = false
        for (digit in digits) {
            val clicked = clickDigitKeyAcrossWindows(root, digit.toString())
            Log.d(TAG, "Digit fallback '$digit' clicked=$clicked")
            if (!clicked) return typedAny
            typedAny = true
        }
        return typedAny
    }

    private fun clickDigitKeyAcrossWindows(primary: AccessibilityNodeInfo, digit: String): Boolean {
        if (clickDigitKey(primary, digit)) return true
        try {
            rootInActiveWindow?.let { if (clickDigitKey(it, digit)) return true }
            windows?.forEach { window -> if (clickDigitKey(window.root, digit)) return true }
        } catch (_: Throwable) {}
        return false
    }

    private fun clickDigitKey(root: AccessibilityNodeInfo?, digit: String): Boolean {
        if (root == null) return false
        val nodes = try { root.findAccessibilityNodeInfosByText(digit) } catch (_: Throwable) { emptyList() }
        for (node in nodes) {
            val nodeText = node.text?.toString()?.trim().orEmpty()
            val nodeDesc = node.contentDescription?.toString()?.trim().orEmpty()
            if ((nodeText == digit || nodeDesc == digit) && clickNodeOrParent(node)) return true
        }
        return false
    }

    private fun clickSendAcrossWindows(primary: AccessibilityNodeInfo): Boolean {
        if (findButton(primary, listOf("send", "dir", "ok", "confirm", "haye"))?.let(::clickNodeOrParent) == true) return true
        try {
            rootInActiveWindow?.let { active ->
                if (findButton(active, listOf("send", "dir", "ok", "confirm", "haye"))?.let(::clickNodeOrParent) == true) return true
            }
            windows?.forEach { window ->
                val root = window.root ?: return@forEach
                if (findButton(root, listOf("send", "dir", "ok", "confirm", "haye"))?.let(::clickNodeOrParent) == true) return true
            }
        } catch (_: Throwable) {}
        return false
    }

    private fun hasEditable(root: AccessibilityNodeInfo): Boolean = findEditable(root) != null

    private fun findEditable(root: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (root == null) return null
        if (root.isVisibleToUser && (root.isEditable || root.className?.toString()?.contains("EditText", ignoreCase = true) == true)) return root
        for (i in 0 until root.childCount) findEditable(root.getChild(i))?.let { return it }
        return null
    }

    private fun findButton(root: AccessibilityNodeInfo?, words: List<String>): AccessibilityNodeInfo? {
        if (root == null) return null
        val text = "${root.text?.toString().orEmpty()} ${root.contentDescription?.toString().orEmpty()}".lowercase()
        if (root.isVisibleToUser && words.any(text::contains) && (root.isClickable || root.parent?.isClickable == true)) return root
        for (i in 0 until root.childCount) findButton(root.getChild(i), words)?.let { return it }
        return null
    }

    private fun clickNodeOrParent(node: AccessibilityNodeInfo): Boolean {
        if (node.isClickable && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
        val parent = node.parent
        return parent?.isClickable == true && parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
    }

    private fun clickCancel(root: AccessibilityNodeInfo) {
        findButton(root, listOf("cancel", "jooji"))?.let(::clickNodeOrParent)
            ?: performGlobalAction(GLOBAL_ACTION_BACK)
    }

    private fun clickDismiss(root: AccessibilityNodeInfo) {
        findButton(root, listOf("ok", "close", "xir", "cancel", "haye"))?.let(::clickNodeOrParent)
            ?: performGlobalAction(GLOBAL_ACTION_BACK)
    }

    private fun closeCurrentSession() {
        holdAwaitingSelection = false
        actionInFlight = false
        actionStep = -1
        handler.post {
            var attempts = 0
            lateinit var closer: Runnable
            closer = Runnable {
                attempts++
                val root = obtainBestUssdRoot()
                if (root != null) clickCancel(root) else performGlobalAction(GLOBAL_ACTION_BACK)
                if (attempts < 3) handler.postDelayed(closer, 400L)
            }
            handler.post(closer)
        }
    }
}
