package com.iftin.resellers.service

import android.content.Context
import android.content.SharedPreferences
import android.util.Log

/**
 * Port of Riyokaab's proven menu-driven USSD state machine.
 *
 * Supported carrier entry points:
 *  - *870*<receiver>#
 *  - *866*<receiver>#
 *  - *101# (receiver is entered later inside the menu)
 *  - *212*<receiver># (normal delivery + live discovery/hold)
 *
 * Anything after `|` is a menu path and MUST NEVER be dialled.
 */
object UssdMenuFlow {
    private const val TAG = "UssdMenuFlow"

    const val PREFS_NAME = "iftin_ussd_prefs"
    const val KEY_FLOW_ACTIVE = "ussd_flow_active"
    const val KEY_COMPLETED_STEPS = "completed_steps"
    const val KEY_MENU_PATH = "menu_path"
    const val KEY_PREFIX = "prefix"
    const val KEY_RECEIVER = "receiver"
    const val KEY_PACKAGE = "package"
    const val KEY_PIN = "pin"
    const val KEY_FINISHED_AT = "finished_at"

    const val KEY_DISCOVERY_MODE = "discovery_mode"
    const val KEY_DISCOVERY_MENU = "discovery_menu"
    const val KEY_DISCOVERY_STARTED_AT = "discovery_started_at"
    const val KEY_HOLD_SESSION = "hold_session"
    const val KEY_RECEIVER_PHONE = "receiver_phone"

    const val FLOW_ID = "IFTIN_MENU_FLOW"

    val MENU_FLOW_PREFIXES = listOf("*870*", "*866*", "*212*", "*101*")

    data class Step(
        val order: Int,
        val name: String,
        val keywords: List<String>,
        val isPinField: Boolean = false,
        val input: (SharedPreferences, String?) -> String,
    )

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun isSomtel101(code: String): Boolean = code.startsWith("*101*") || code.startsWith("*101#")

    fun normalizeLocalPhone(raw: String): String {
        var digits = raw.filter(Char::isDigit)
        if (digits.startsWith("252")) digits = digits.removePrefix("252")
        if (digits.startsWith("0")) digits = digits.removePrefix("0")
        return if (digits.length > 9) digits.takeLast(9) else digits
    }

    fun dialPrefix(ussdCode: String?): String {
        val code = ussdCode?.trim().orEmpty()
        if (isSomtel101(code)) return "*101*"
        return MENU_FLOW_PREFIXES.firstOrNull { code.startsWith(it) } ?: "*870*"
    }

    fun triggerCode(receiverPhone: String, prefix: String): String {
        val safePrefix = prefix.takeIf { MENU_FLOW_PREFIXES.contains(it) } ?: "*870*"
        if (safePrefix == "*101*") return "*101#"
        return "$safePrefix${normalizeLocalPhone(receiverPhone)}#"
    }

    fun isMenuFlow(ussdCode: String?): Boolean {
        val code = ussdCode?.trim() ?: return false
        return isSomtel101(code) || MENU_FLOW_PREFIXES.any { code.startsWith(it) }
    }

    fun stripMenuSuffix(template: String): String = template.substringBefore('|').trim()

    fun parseMenuPath(template: String?): List<String> {
        if (template.isNullOrBlank()) return listOf("1", "1")
        val raw = template.trim()
        val suffix = if ('|' in raw) raw.substringAfter('|') else raw
        val cleaned = suffix.replace("#", "").trim()
        if (cleaned.isEmpty()) return listOf("1", "1")
        return cleaned.split(',').map { it.trim() }.filter { it.isNotEmpty() }.ifEmpty { listOf("1", "1") }
    }

    fun activate(
        context: Context,
        menuPath: List<String>,
        prefix: String,
        receiverPhone: String? = null,
        packageValue: String? = null,
        pin: String? = null,
    ) {
        val safePrefix = prefix.takeIf { MENU_FLOW_PREFIXES.contains(it) } ?: "*870*"
        val path = menuPath.ifEmpty { listOf("1", "1") }.joinToString(",") { it.replace(",", " ") }
        val edit = prefs(context).edit()
            .putString(KEY_FLOW_ACTIVE, FLOW_ID)
            .putString(KEY_COMPLETED_STEPS, "")
            .putString(KEY_MENU_PATH, path)
            .putString(KEY_PREFIX, safePrefix)
            .remove(KEY_FINISHED_AT)
            .remove(KEY_DISCOVERY_MODE)
            .remove(KEY_DISCOVERY_MENU)
            .remove(KEY_DISCOVERY_STARTED_AT)
            .remove(KEY_HOLD_SESSION)

        if (receiverPhone.isNullOrBlank()) edit.remove(KEY_RECEIVER_PHONE)
        else edit.putString(KEY_RECEIVER_PHONE, normalizeLocalPhone(receiverPhone))
        if (packageValue.isNullOrBlank()) edit.remove(KEY_PACKAGE) else edit.putString(KEY_PACKAGE, packageValue)
        if (pin.isNullOrBlank()) edit.remove(KEY_PIN) else edit.putString(KEY_PIN, pin.filter(Char::isDigit))
        edit.apply()
    }

    fun activateDiscovery(context: Context, menu1Label: String, prefix: String = "*212*", hold: Boolean = true) {
        activate(context, listOf(menu1Label.ifBlank { "1" }), prefix)
        prefs(context).edit()
            .putBoolean(KEY_DISCOVERY_MODE, true)
            .putBoolean(KEY_HOLD_SESSION, hold)
            .putLong(KEY_DISCOVERY_STARTED_AT, System.currentTimeMillis())
            .remove(KEY_DISCOVERY_MENU)
            .apply()
    }

    fun resumeHeldSelection(context: Context, label: String, prefix: String = "*212*", row: Int? = null) {
        val step2 = row?.toString() ?: label.replace(",", " ")
        prefs(context).edit()
            .putString(KEY_FLOW_ACTIVE, FLOW_ID)
            .putString(KEY_COMPLETED_STEPS, "2")
            .putString(KEY_MENU_PATH, "1,$step2")
            .putString(KEY_PREFIX, prefix.takeIf { MENU_FLOW_PREFIXES.contains(it) } ?: "*212*")
            .remove(KEY_DISCOVERY_MODE)
            .remove(KEY_DISCOVERY_MENU)
            .remove(KEY_DISCOVERY_STARTED_AT)
            .apply()
    }

    fun isDiscoveryMode(context: Context): Boolean {
        val p = prefs(context)
        if (!p.getBoolean(KEY_DISCOVERY_MODE, false)) return false
        val started = p.getLong(KEY_DISCOVERY_STARTED_AT, 0L)
        if (started > 0 && System.currentTimeMillis() - started > 180_000L) {
            clearDiscovery(context)
            return false
        }
        return true
    }

    fun isHoldSession(context: Context): Boolean = prefs(context).getBoolean(KEY_HOLD_SESSION, false)

    fun saveDiscoveryMenu(context: Context, text: String) {
        prefs(context).edit().putString(KEY_DISCOVERY_MENU, text).apply()
    }

    fun consumeDiscoveryMenu(context: Context): String? {
        val p = prefs(context)
        val value = p.getString(KEY_DISCOVERY_MENU, null)
        if (!value.isNullOrBlank()) p.edit().remove(KEY_DISCOVERY_MENU).apply()
        return value
    }

    fun clearDiscovery(context: Context) {
        prefs(context).edit()
            .remove(KEY_DISCOVERY_MODE)
            .remove(KEY_DISCOVERY_MENU)
            .remove(KEY_DISCOVERY_STARTED_AT)
            .remove(KEY_HOLD_SESSION)
            .apply()
    }

    fun currentPrefix(context: Context): String = prefs(context).getString(KEY_PREFIX, "*870*") ?: "*870*"
    fun isSomnet866(context: Context): Boolean = currentPrefix(context) == "*866*"
    fun isActive(context: Context): Boolean = prefs(context).getString(KEY_FLOW_ACTIVE, null) == FLOW_ID

    fun finish(context: Context) {
        prefs(context).edit()
            .remove(KEY_FLOW_ACTIVE)
            .remove(KEY_COMPLETED_STEPS)
            .remove(KEY_MENU_PATH)
            .remove(KEY_DISCOVERY_MODE)
            .remove(KEY_DISCOVERY_STARTED_AT)
            .remove(KEY_RECEIVER_PHONE)
            .putLong(KEY_FINISHED_AT, System.currentTimeMillis())
            .apply()
    }

    fun deactivate(context: Context) {
        prefs(context).edit()
            .remove(KEY_FLOW_ACTIVE)
            .remove(KEY_COMPLETED_STEPS)
            .remove(KEY_MENU_PATH)
            .remove(KEY_RECEIVER_PHONE)
            .apply()
    }

    private fun completedSteps(p: SharedPreferences): Set<Int> = p.getString(KEY_COMPLETED_STEPS, "")
        .orEmpty().split(',').mapNotNull { it.trim().toIntOrNull() }.toSet()

    fun markStepCompleted(context: Context, order: Int) {
        val p = prefs(context)
        val done = completedSteps(p).toMutableSet().apply { add(order) }
        p.edit().putString(KEY_COMPLETED_STEPS, done.sorted().joinToString(",")).apply()
    }

    private fun normalize(raw: String): String = raw.lowercase()
        .replace(Regex("""\baan\s+xadidnayn\b"""), " unlimited ")
        .replace(Regex("""\b(xadidneyn|xadidnaan|xaddidnayn|xadidneen)\b"""), "xadidnayn")
        .replace(Regex("""\b(hours?|hrs?|saacadood|saacado|saacad)\b"""), "saac")
        .replace(Regex("""\b(days?|maalmood|maalmo)\b"""), "maalin")
        .replace(Regex("""[=,;/\-–—_|\\\[\]()<>\"']"""), " ")
        .replace(Regex("""\s+"""), " ")
        .trim()

    private val pricePrefix = Regex("""^\s*\$?\s*\d+(?:[.,]\d+)?\s*=\s*""")
    private val numberedLine = Regex("""^\s*(\d+)\s*(?:[\.\)\-:]\s*|\s+)(.+)$""")

    fun parseMenuItems(dialogText: String?): List<Pair<Int, String>> {
        if (dialogText.isNullOrBlank()) return emptyList()
        val text = dialogText.replace(Regex("""\s+\|\s+"""), "\n")
        val out = LinkedHashMap<Int, String>()
        text.lineSequence().forEach { raw ->
            val match = numberedLine.matchEntire(raw.trim()) ?: return@forEach
            val index = match.groupValues[1].toIntOrNull() ?: return@forEach
            val label = match.groupValues[2].trim()
            if (label.length >= 2) out.putIfAbsent(index, label)
        }
        return out.entries.map { it.key to it.value }
    }

    fun findNumberForKeywords(dialogText: String?, keywordGroups: List<String>): Int? {
        if (dialogText.isNullOrBlank()) return null
        val groups = keywordGroups
            .flatMap { it.split(';') }
            .map { normalize(pricePrefix.replace(it.trim(), "")) }
            .map { it.split(' ').filter(String::isNotBlank) }
            .filter(List<String>::isNotEmpty)
        if (groups.isEmpty()) return null

        val rows = parseMenuItems(dialogText)
        var best: Pair<Int, Int>? = null
        val durationMatches = mutableSetOf<Int>()
        for ((index, label) in rows) {
            val hay = normalize(pricePrefix.replace(label, ""))
            val hayTokens = hay.split(' ').toSet()
            for (tokens in groups) {
                val matched = tokens.count { it in hayTokens }
                if (matched == tokens.size) return index
                val numericTokens = tokens.filter { token -> token.any(Char::isDigit) }
                val numbersMatch = numericTokens.all { it in hayTokens }
                if (numbersMatch && tokens.size >= 4 && matched >= tokens.size - 1) {
                    if (best == null || matched > best!!.second) best = index to matched
                }
                val units = tokens.filter { it in setOf("saac", "maalin", "week", "todobaad", "bil") }
                if (numericTokens.isNotEmpty() && units.isNotEmpty() && numbersMatch && units.all { it in hayTokens }) {
                    durationMatches += index
                }
            }
        }
        return best?.first ?: durationMatches.singleOrNull()
    }

    fun findNumberForPrice(dialogText: String?, requestedLabel: String?): Int? {
        if (dialogText.isNullOrBlank() || requestedLabel.isNullOrBlank()) return null
        val regex = Regex("""\$?\s*(\d+(?:[.,]\d+)?)\s*=""")
        val wanted = regex.find(requestedLabel)?.groupValues?.getOrNull(1)?.replace(',', '.')?.toDoubleOrNull() ?: return null
        val matches = parseMenuItems(dialogText).filter { (_, label) ->
            regex.find(label)?.groupValues?.getOrNull(1)?.replace(',', '.')?.toDoubleOrNull()?.let { kotlin.math.abs(it - wanted) < 0.0001 } == true
        }
        return matches.singleOrNull()?.first
    }

    fun resolveMenuField(field: String?, dialogText: String?, allowDefault: Boolean = true): String {
        val clean = field?.trim().orEmpty()
        if (clean.isEmpty()) return if (allowDefault) "1" else ""
        if (clean.all(Char::isDigit)) return clean
        return findNumberForKeywords(dialogText, listOf(clean))?.toString()
            ?: findNumberForPrice(dialogText, clean)?.toString()
            ?: if (allowDefault) "1" else ""
    }

    fun verifySelection(dialogText: String?, label: String?): Int? {
        if (dialogText.isNullOrBlank() || label.isNullOrBlank()) return null
        return resolveMenuField(label, dialogText, allowDefault = false).toIntOrNull()
            ?: findNumberForPrice(dialogText, label)
    }

    fun menuSignature(dialogText: String?): Set<String> = parseMenuItems(dialogText)
        .map { (_, label) -> normalize(label.replace(Regex("""^\s*[^=]{0,20}=\s*"""), "")) }
        .filter(String::isNotBlank)
        .toSet()

    fun menusMatch(a: String?, b: String?): Boolean {
        val left = menuSignature(a)
        return left.isNotEmpty() && left == menuSignature(b)
    }

    fun isPackageMenuDialog(dialogText: String?): Boolean {
        if (dialogText.isNullOrBlank()) return false
        val lower = dialogText.lowercase()
        return parseMenuItems(dialogText).size >= 2 && (
            lower.contains("package") || lower.contains("xirmo") || lower.contains("mudnaan") ||
                lower.contains("maamuus") || lower.contains("unlimited") || lower.contains("xadid") ||
                lower.contains("gb") || lower.contains("mb") || lower.contains("saac") || lower.contains("$")
            )
    }

    fun isUssdDialogText(dialogText: String?): Boolean {
        if (dialogText.isNullOrBlank()) return false
        val lower = dialogText.lowercase()
        val hasSend = lower.contains("send") || lower.contains("dir") || lower.contains("ok")
        val hasCancel = lower.contains("cancel") || lower.contains("jooji")
        val hasMenu = parseMenuItems(dialogText).isNotEmpty()
        val prompt = lower.contains("pin") || lower.contains("furaha") || lower.contains("geli") || lower.contains("number") || lower.contains("lambar")
        return (hasSend && (hasCancel || hasMenu || prompt)) || hasMenu
    }

    private fun isAirtimeDialog(text: String): Boolean {
        val lower = text.lowercase()
        return lower.contains("airtime") || lower.contains("credit") || lower.contains("waqti")
    }

    val STEPS: List<Step> = listOf(
        Step(2, "menu_data", listOf("Data", "Xogta", "Internet", "Somnet", "Somtel", "Menu")) { p, text ->
            resolveMenuField(parseMenuPath(p.getString(KEY_MENU_PATH, "1,1")).getOrNull(0), text)
        },
        Step(3, "package_select", listOf("Mudnaan", "Maamuus", "Unlimited", "package", "xirmo", "MB", "GB", "Bundle", "saac", "$")) { p, text ->
            val path = parseMenuPath(p.getString(KEY_MENU_PATH, "1,1"))
            val menuField = path.getOrNull(1).orEmpty()
            val legacy = p.getString(KEY_PACKAGE, "").orEmpty().trim()
            when {
                menuField.isNotBlank() -> resolveMenuField(menuField, text, allowDefault = false)
                legacy.all(Char::isDigit) && legacy.isNotBlank() -> legacy
                else -> "1"
            }
        },
        Step(4, "menu_airtime", listOf("Airtime", "Credit", "Waqti")) { p, text ->
            resolveMenuField(parseMenuPath(p.getString(KEY_MENU_PATH, "1,1")).getOrNull(1), text)
        },
        Step(5, "pin", listOf("PIN", "password", "furaha", "sir"), true) { p, _ ->
            val value = p.getString(KEY_PIN, "")?.filter(Char::isDigit).orEmpty()
            if (value.length in 3..12) value else ""
        },
        Step(6, "receiver_phone", listOf("lambarka", "lambar", "number", "phone", "cinwaanka", "mobile", "geli")) { p, _ ->
            normalizeLocalPhone(p.getString(KEY_RECEIVER_PHONE, "").orEmpty())
        },
        Step(7, "menu_extra", listOf("Dooro", "Select", "Choose", "Xulo")) { p, text ->
            resolveMenuField(parseMenuPath(p.getString(KEY_MENU_PATH, "1,1")).getOrNull(2), text)
        },
    )

    fun matchStep(context: Context, dialogText: String?): Step? {
        if (!isUssdDialogText(dialogText)) return null
        val text = dialogText.orEmpty()
        val lower = text.lowercase()
        val p = prefs(context)
        val done = completedSteps(p)

        val pin = STEPS.first { it.name == "pin" }
        if (pin.order !in done && pin.keywords.any { lower.contains(it.lowercase()) }) return pin

        val packageStep = STEPS.first { it.name == "package_select" }
        if (packageStep.order !in done && isPackageMenuDialog(text)) return packageStep

        val airtime = STEPS.first { it.name == "menu_airtime" }
        if (airtime.order !in done && isAirtimeDialog(text)) return airtime

        val packageDialog = isPackageMenuDialog(text)
        val somtel101 = currentPrefix(context) == "*101*"
        val menuPath = parseMenuPath(p.getString(KEY_MENU_PATH, "1,1"))
        val allowExtra = menuPath.getOrNull(2)?.isNotBlank() == true && 2 in done && 3 in done && !packageDialog

        return STEPS.firstOrNull { step ->
            step.order !in done && !step.isPinField &&
                !(step.name == "menu_data" && packageDialog) &&
                (step.name != "receiver_phone" || somtel101) &&
                (step.name != "menu_extra" || allowExtra) &&
                step.keywords.any { lower.contains(it.lowercase()) }
        }
    }

    fun inputFor(context: Context, step: Step, dialogText: String?): String {
        val value = step.input(prefs(context), dialogText)
        if (value.isBlank()) Log.w(TAG, "No safe input resolved for ${step.name}")
        return value
    }
}
