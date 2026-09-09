package com.iftin.resellers.service

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.IBinder
import android.provider.Settings
import android.telecom.TelecomManager
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.iftin.resellers.R
import com.iftin.resellers.api.DeliveryApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class DeliveryService : Service() {
    companion object {
        const val ACTION_USSD_RESULT = "com.iftin.resellers.USSD_RESULT"
        const val ACTION_DISCOVERY_CAPTURED = "com.iftin.resellers.DISCOVERY_CAPTURED"
        private const val EXTRA_SUCCESS = "success"
        private const val EXTRA_RESPONSE = "response"

        fun signalUssdResult(context: Context, success: Boolean, response: String) {
            val i = Intent(context, DeliveryService::class.java)
                .setAction(ACTION_USSD_RESULT)
                .putExtra(EXTRA_SUCCESS, success)
                .putExtra(EXTRA_RESPONSE, response)
            context.startService(i)
        }

        fun signalDiscoveryCaptured(context: Context, rawMenu: String) {
            val i = Intent(context, DeliveryService::class.java)
                .setAction(ACTION_DISCOVERY_CAPTURED)
                .putExtra(EXTRA_RESPONSE, rawMenu)
            context.startService(i)
        }
    }

    private enum class ActiveMode { NONE, QUEUE, DISCOVERY, SELECTION }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val api = DeliveryApiClient()
    private var loopJob: Job? = null

    @Volatile private var mode = ActiveMode.NONE
    @Volatile private var currentQueue: DeliveryApiClient.QueueJob? = null
    @Volatile private var currentDiscovery: DeliveryApiClient.DiscoveryJob? = null
    @Volatile private var heldDiscoveryId: String? = null
    @Volatile private var currentSelection: DeliveryApiClient.DiscoverySelection? = null
    @Volatile private var actionStartedAt = 0L
    @Volatile private var holdStartedAt = 0L

    private val deviceId: String
        get() {
            val saved = getSharedPreferences("agent", MODE_PRIVATE).getString("device_id", "").orEmpty().trim()
            if (saved.isNotBlank()) return saved
            return Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID).orEmpty()
        }

    /** The agent only polls once the reseller account has bound this device to a tenant. */
    private fun isSignedIn(): Boolean =
        getSharedPreferences("agent", MODE_PRIVATE)
            .getString("account_email", "").orEmpty().isNotBlank()

    override fun onCreate() {
        super.onCreate()
        createChannel()
        startForeground(
            870,
            NotificationCompat.Builder(this, "delivery")
                .setSmallIcon(android.R.drawable.stat_sys_phone_call)
                .setContentTitle(getString(R.string.app_name))
                .setContentText("USSD delivery agent is running")
                .setOngoing(true)
                .build(),
        )
        startLoop()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_USSD_RESULT -> handleUssdResult(
                intent.getBooleanExtra(EXTRA_SUCCESS, false),
                intent.getStringExtra(EXTRA_RESPONSE).orEmpty(),
            )
            ACTION_DISCOVERY_CAPTURED -> handleDiscoveryCaptured(intent.getStringExtra(EXTRA_RESPONSE).orEmpty())
        }
        startLoop()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        loopJob?.cancel()
        scope.cancel()
        super.onDestroy()
    }

    private fun startLoop() {
        if (loopJob?.isActive == true) return
        loopJob = scope.launch {
            while (isActive) {
                try {
                    tick()
                } catch (_: Throwable) {
                    delay(4000)
                }
            }
        }
    }

    private suspend fun tick() {
        if (!api.isConfigured() || deviceId.isBlank() || !isSignedIn()) {
            delay(10_000)
            return
        }

        if (mode == ActiveMode.QUEUE || mode == ActiveMode.SELECTION) {
            if (actionStartedAt > 0 && System.currentTimeMillis() - actionStartedAt > 90_000) {
                when (mode) {
                    ActiveMode.QUEUE -> currentQueue?.let {
                        // Before declaring timeout, give the operator SMS a chance:
                        // many confirmations arrive by SMS after the USSD dialog closes.
                        val sms = waitForProviderSms(actionStartedAt, 12_000)
                        when {
                            sms != null && SmsHelper.looksSuccessful(sms) ->
                                api.reportStatus(it.id, deviceId, "completed", sms, null)
                            sms != null ->
                                api.reportStatus(it.id, deviceId, "failed", sms, "SMS xaqiijin guul darreystay: ${sms.take(300)}")
                            else ->
                                api.reportStatus(it.id, deviceId, "timeout", null, "USSD response timeout")
                        }
                    }
                    ActiveMode.SELECTION -> currentSelection?.let {
                        // Mark the held-session delivery lost. The backend will enqueue the
                        // safe *212* redial fallback for the already-paid order.
                        api.completeDiscoverySelection(deviceId, it.id, false, "USSD response timeout")
                        heldDiscoveryId = null
                        holdStartedAt = 0L
                        UssdMenuFlow.clearDiscovery(this)
                        UssdAccessibilityService.closeUssdSession()
                    }
                    else -> Unit
                }
                resetActive()
            }
            delay(750)
            return
        }

        heldDiscoveryId?.let { heldId ->
            val selection = api.claimDiscoverySelection(deviceId)
            if (selection != null && selection.id == heldId) {
                currentSelection = selection
                mode = ActiveMode.SELECTION
                actionStartedAt = System.currentTimeMillis()
                UssdMenuFlow.resumeHeldSelection(this, selection.label, "*212*", selection.index)
                delay(500)
                return
            }

            val holdAge = System.currentTimeMillis() - holdStartedAt
            if (holdAge > 8 * 60_000L || (holdAge > 15_000L && api.hasWaitingDiscovery(deviceId))) {
                api.discoverySessionLost(deviceId, heldId)
                heldDiscoveryId = null
                holdStartedAt = 0L
                UssdMenuFlow.clearDiscovery(this)
                UssdAccessibilityService.closeUssdSession()
            } else {
                delay(1200)
                return
            }
        }

        val discovery = api.claimDiscovery(deviceId)
        if (discovery != null) {
            currentDiscovery = discovery
            mode = ActiveMode.DISCOVERY
            actionStartedAt = System.currentTimeMillis()
            UssdMenuFlow.activateDiscovery(this, discovery.menu1Label, "*212*", hold = true)
            if (!dial(discovery.ussdCode, discovery.simSlot)) {
                api.failDiscovery(deviceId, discovery.id, "call_permission_or_sim_error")
                resetActive()
            }
            delay(1000)
            return
        }

        val (queue, nextPoll) = api.getPending(deviceId)
        if (queue == null) {
            delay(nextPoll)
            return
        }

        currentQueue = queue
        mode = ActiveMode.QUEUE
        actionStartedAt = System.currentTimeMillis()

        val code = queue.ussdCode.trim()
        if (UssdMenuFlow.isMenuFlow(code)) {
            val prefix = UssdMenuFlow.dialPrefix(code)
            val path = if ('|' in code) UssdMenuFlow.parseMenuPath(code) else listOf("1", "1")
            UssdMenuFlow.activate(
                this,
                menuPath = path,
                prefix = prefix,
                receiverPhone = queue.receiverPhone,
                pin = queue.pinCode,
            )
        }

        if (!api.markDispatched(queue.id, deviceId)) {
            resetActive()
            delay(1000)
            return
        }

        val dialCode = when {
            UssdMenuFlow.dialPrefix(code) == "*101*" -> "*101#"
            '|' in code -> UssdMenuFlow.stripMenuSuffix(code)
            else -> code
        }

        if (!dial(dialCode, queue.simSlot)) {
            api.reportStatus(queue.id, deviceId, "failed", null, "CALL_PHONE permission or SIM routing failed")
            resetActive()
        }
        delay(1000)
    }

    private fun handleDiscoveryCaptured(rawMenu: String) {
        val discovery = currentDiscovery ?: return
        if (mode != ActiveMode.DISCOVERY || rawMenu.isBlank()) return
        scope.launch {
            try {
                val items = UssdMenuFlow.parseMenuItems(rawMenu)
                if (items.isEmpty()) {
                    api.failDiscovery(deviceId, discovery.id, "package_menu_empty")
                    UssdMenuFlow.clearDiscovery(this@DeliveryService)
                } else {
                    api.completeDiscovery(deviceId, discovery.id, rawMenu, items, hold = true)
                    heldDiscoveryId = discovery.id
                    holdStartedAt = System.currentTimeMillis()
                }
            } finally {
                currentDiscovery = null
                mode = ActiveMode.NONE
                actionStartedAt = 0L
            }
        }
    }

    private fun handleUssdResult(success: Boolean, response: String) {
        scope.launch {
            try {
                when (mode) {
                    ActiveMode.QUEUE -> currentQueue?.let {
                        api.reportStatus(
                            queueId = it.id,
                            deviceId = deviceId,
                            status = if (success) "completed" else "failed",
                            providerResponse = response,
                            errorMessage = if (success) null else response.take(300),
                        )
                    }
                    ActiveMode.SELECTION -> currentSelection?.let {
                        api.completeDiscoverySelection(deviceId, it.id, success, response)
                        heldDiscoveryId = null
                        holdStartedAt = 0L
                        UssdMenuFlow.clearDiscovery(this@DeliveryService)
                    }
                    else -> Unit
                }
            } finally {
                resetActive()
            }
        }
    }

    private fun resetActive() {
        currentQueue = null
        currentDiscovery = null
        currentSelection = null
        mode = ActiveMode.NONE
        actionStartedAt = 0L
        UssdMenuFlow.deactivate(this)
    }

    private fun dial(code: String, simSlot: Int): Boolean {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) {
            return false
        }
        return try {
            val uri = Uri.parse("tel:${Uri.encode(code)}")
            val telecom = getSystemService(TELECOM_SERVICE) as TelecomManager
            val accounts = telecom.callCapablePhoneAccounts
            val extras = Bundle()
            accounts.getOrNull(simSlot)?.let {
                extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, it)
            }
            telecom.placeCall(uri, extras)
            true
        } catch (_: Throwable) {
            false
        }
    }

    private fun createChannel() {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel("delivery", "Delivery Agent", NotificationManager.IMPORTANCE_LOW),
        )
    }
}
