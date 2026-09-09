package com.iftin.resellers.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log

/**
 * Reads operator confirmation SMS (Hormuud/EVC Plus, Somtel, Telesom/ZAAD, ...)
 * so a delivery result can include the operator's own SMS, not only the USSD
 * dialog text. Two capture paths:
 *  1. SmsReceiver: live broadcast for newly arrived SMS.
 *  2. latestProviderSms(): inbox query fallback for messages that arrived
 *     while a USSD action was running.
 */
object SmsHelper {
    private const val TAG = "IftinSms"
    private const val PREFS = "agent"
    private const val KEY_SMS_BODY = "last_provider_sms_body"
    private const val KEY_SMS_AT = "last_provider_sms_at"

    private val SENDERS = listOf(
        "505", "hormuud", "evc", "evcplus", "somtel", "telesom", "zaad",
        "somnet", "amtel", "golis", "safone", "somlink", "sahal", "edahab",
        "my money", "mymoney", "waafi", "premier",
    )

    private val SUCCESS_WORDS = listOf(
        "success", "successful", "ugu shubtay", "u shubtay", "ku guulaysatay",
        "completed", "activated", "transaction id", "haraaga", "diray", "shubnay",
    )
    private val FAILURE_WORDS = listOf(
        "failed", "khalad", "error", "insufficient", "invalid", "declined",
        "rejected", "ma suurtogelin", "haraagaagu kuma filna",
    )

    fun isProviderSender(address: String?): Boolean {
        val a = address?.lowercase()?.trim().orEmpty()
        if (a.isEmpty()) return false
        return SENDERS.any { a.contains(it) }
    }

    fun looksSuccessful(body: String): Boolean {
        val lower = body.lowercase()
        if (FAILURE_WORDS.any(lower::contains)) return false
        return SUCCESS_WORDS.any(lower::contains)
    }

    fun saveFromReceiver(context: Context, body: String, at: Long) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_SMS_BODY, body)
            .putLong(KEY_SMS_AT, at)
            .apply()
        Log.d(TAG, "Provider SMS captured (${body.length} chars)")
    }

    /** SMS captured live by the receiver, if it arrived at/after [sinceMs]. */
    fun savedSms(context: Context, sinceMs: Long): String? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val at = prefs.getLong(KEY_SMS_AT, 0L)
        val body = prefs.getString(KEY_SMS_BODY, "").orEmpty()
        if (at >= sinceMs && body.isNotBlank()) return body
        return null
    }

    /** Latest provider SMS in the inbox received at/after [sinceMs]. */
    fun latestProviderSms(context: Context, sinceMs: Long): String? {
        savedSms(context, sinceMs)?.let { return it }
        return try {
            val cursor = context.contentResolver.query(
                Telephony.Sms.Inbox.CONTENT_URI,
                arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
                "${Telephony.Sms.DATE} >= ?",
                arrayOf(sinceMs.toString()),
                "${Telephony.Sms.DATE} DESC",
            ) ?: return null
            cursor.use {
                while (it.moveToNext()) {
                    val address = it.getString(0)
                    val body = it.getString(1).orEmpty()
                    if (isProviderSender(address) && body.isNotBlank()) {
                        saveFromReceiver(context, body, it.getLong(2))
                        return body
                    }
                }
                null
            }
        } catch (t: Throwable) {
            Log.w(TAG, "SMS inbox read failed: ${t.message}")
            null
        }
    }
}

/** Captures incoming operator SMS in real time and stores the latest one. */
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val messages = try {
            Telephony.Sms.Intents.getMessagesFromIntent(intent)
        } catch (_: Throwable) {
            null
        } ?: return
        for (message in messages) {
            if (SmsHelper.isProviderSender(message.originatingAddress)) {
                SmsHelper.saveFromReceiver(
                    context,
                    message.messageBody.orEmpty(),
                    message.timestampMillis,
                )
            }
        }
    }
}
