package com.iftin.resellers.api

import com.iftin.resellers.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class DeliveryApiClient {
    data class QueueJob(
        val id: String,
        val orderId: String,
        val ussdCode: String,
        val receiverPhone: String,
        val provider: String,
        val pinCode: String,
        val simSlot: Int,
    )

    data class DiscoveryJob(
        val id: String,
        val phoneNumber: String,
        val menu1Label: String,
        val ussdCode: String,
        val simSlot: Int,
    )

    data class DiscoverySelection(
        val id: String,
        val label: String,
        val index: Int?,
        val orderId: String?,
    )

    data class RegistrationResult(
        val success: Boolean,
        val tenantId: String?,
        val deviceName: String?,
        val errorMessage: String?,
    )

    private val functionBase = BuildConfig.API_BASE_URL.trimEnd('/')
    private val anonKey = BuildConfig.ANON_KEY
    private val restBase = functionBase.substringBefore("/functions/v1/").trimEnd('/') + "/rest/v1"
    private val functionsRoot = functionBase.substringBeforeLast('/')

    fun isConfigured(): Boolean = functionBase.startsWith("https://") && anonKey.isNotBlank()

    /**
     * Binds this physical device to the reseller tenant that owns the supplied
     * account. The server verifies the credentials, resolves the tenant through
     * tenant_members and refuses devices already bound to another reseller.
     */
    suspend fun registerDevice(
        deviceId: String,
        deviceName: String,
        email: String,
        password: String,
    ): RegistrationResult = withContext(Dispatchers.IO) {
        if (!isConfigured()) {
            return@withContext RegistrationResult(false, null, null, "Backend-ka lama habayn (build configuration)")
        }
        val body = JSONObject()
            .put("deviceId", deviceId)
            .put("deviceName", deviceName)
            .put("email", email.trim())
            .put("password", password)
        try {
            val (status, text) = rawRequest("POST", "$functionsRoot/register-device", body)
            val json = runCatching { JSONObject(text) }.getOrNull()
            if (status in 200..299 && json?.optBoolean("success", false) == true) {
                val tenantId = json.optString("tenantId").takeIf { it.isNotBlank() && it != "null" }
                val name = json.optJSONObject("device")?.optString("device_name")
                RegistrationResult(true, tenantId, name, null)
            } else {
                val message = json?.optString("error").takeIf { !it.isNullOrBlank() }
                    ?: "Diiwaangelintu way fashilantay (HTTP $status)"
                RegistrationResult(false, null, null, message)
            }
        } catch (e: Exception) {
            RegistrationResult(false, null, null, e.message ?: "Xiriirka internetka ma shaqeynin")
        }
    }

    suspend fun getPending(deviceId: String): Pair<QueueJob?, Long> = withContext(Dispatchers.IO) {
        val response = request("GET", "$functionBase/pending?deviceId=${enc(deviceId)}")
        val root = JSONObject(response)
        val nextPoll = root.optLong("nextPollMs", 4000L).coerceIn(1000L, 20_000L)
        val arr = root.optJSONArray("orders") ?: JSONArray()
        if (arr.length() == 0) return@withContext null to nextPoll
        val item = arr.getJSONObject(0)
        QueueJob(
            id = item.optString("id"),
            orderId = item.optString("orderId"),
            ussdCode = item.optString("ussdCode"),
            receiverPhone = item.optString("receiverPhone"),
            provider = item.optString("provider"),
            pinCode = item.optString("pinCode"),
            simSlot = item.optInt("simSlot", 0),
        ) to nextPoll
    }

    suspend fun markDispatched(queueId: String, deviceId: String): Boolean = withContext(Dispatchers.IO) {
        val body = JSONObject().put("queueId", queueId).put("deviceId", deviceId)
        JSONObject(request("POST", "$functionBase/dispatch", body)).optBoolean("success", false)
    }

    suspend fun reportStatus(
        queueId: String,
        deviceId: String,
        status: String,
        providerResponse: String?,
        errorMessage: String? = null,
    ) = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("queueId", queueId)
            .put("deviceId", deviceId)
            .put("status", status)
        if (!providerResponse.isNullOrBlank()) body.put("providerResponse", providerResponse)
        if (!errorMessage.isNullOrBlank()) body.put("errorMessage", errorMessage)
        request("POST", "$functionBase/status", body)
        Unit
    }

    suspend fun claimDiscovery(deviceId: String): DiscoveryJob? = withContext(Dispatchers.IO) {
        val raw = rpc("claim_next_discovery", JSONObject().put("p_device_id", deviceId))
        if (raw == "null" || raw.isBlank()) return@withContext null
        val o = JSONObject(raw)
        val id = o.optString("id")
        if (id.isBlank()) return@withContext null
        DiscoveryJob(
            id = id,
            phoneNumber = o.optString("phone_number"),
            menu1Label = o.optString("menu1_label"),
            ussdCode = o.optString("ussd_code"),
            simSlot = o.optInt("sim_slot", 0),
        )
    }

    suspend fun completeDiscovery(deviceId: String, id: String, rawMenu: String, items: List<Pair<Int, String>>, hold: Boolean) =
        withContext(Dispatchers.IO) {
            val rows = JSONArray()
            items.forEach { (index, label) -> rows.put(JSONObject().put("index", index.toString()).put("label", label)) }
            rpc(
                "complete_discovery",
                JSONObject()
                    .put("p_device_id", deviceId)
                    .put("p_id", id)
                    .put("p_raw_menu", rawMenu)
                    .put("p_items", rows)
                    .put("p_error", JSONObject.NULL)
                    .put("p_hold", hold),
            )
            Unit
        }

    suspend fun failDiscovery(deviceId: String, id: String, error: String) = withContext(Dispatchers.IO) {
        rpc(
            "complete_discovery",
            JSONObject()
                .put("p_device_id", deviceId)
                .put("p_id", id)
                .put("p_raw_menu", "")
                .put("p_items", JSONArray())
                .put("p_error", error)
                .put("p_hold", false),
        )
        Unit
    }

    suspend fun claimDiscoverySelection(deviceId: String): DiscoverySelection? = withContext(Dispatchers.IO) {
        val raw = rpc("claim_discovery_selection", JSONObject().put("p_device_id", deviceId))
        if (raw == "null" || raw.isBlank()) return@withContext null
        val o = JSONObject(raw)
        val id = o.optString("id")
        if (id.isBlank()) return@withContext null
        DiscoverySelection(
            id = id,
            label = o.optString("label"),
            index = o.optString("index").toIntOrNull(),
            orderId = o.optString("order_id").takeIf(String::isNotBlank),
        )
    }

    suspend fun completeDiscoverySelection(deviceId: String, id: String, success: Boolean, response: String?) = withContext(Dispatchers.IO) {
        rpc(
            "complete_discovery_selection",
            JSONObject()
                .put("p_device_id", deviceId)
                .put("p_id", id)
                .put("p_success", success)
                .put("p_response", response ?: JSONObject.NULL),
        )
        Unit
    }

    suspend fun discoverySessionLost(deviceId: String, id: String) = withContext(Dispatchers.IO) {
        rpc("discovery_session_lost", JSONObject().put("p_device_id", deviceId).put("p_id", id))
        Unit
    }

    /** Device-scoped to prevent one reseller's *212* queue from interrupting another tenant's held session. */
    suspend fun hasWaitingDiscovery(deviceId: String): Boolean = withContext(Dispatchers.IO) {
        val raw = rpc("discovery_has_waiting_request", JSONObject().put("p_device_id", deviceId))
        raw.trim().equals("true", ignoreCase = true)
    }

    private fun rpc(name: String, body: JSONObject): String = request("POST", "$restBase/rpc/$name", body)

    private fun request(method: String, url: String, body: JSONObject? = null): String {
        if (!isConfigured()) error("Delivery API is not configured")
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 12_000
        connection.readTimeout = 20_000
        connection.setRequestProperty("apikey", anonKey)
        connection.setRequestProperty("Authorization", "Bearer $anonKey")
        connection.setRequestProperty("Content-Type", "application/json")
        if (body != null) {
            connection.doOutput = true
            connection.outputStream.use { it.write(body.toString().toByteArray()) }
        }
        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        connection.disconnect()
        if (status !in 200..299) error("HTTP $status: ${text.take(300)}")
        return text
    }

    private fun enc(value: String): String = java.net.URLEncoder.encode(value, "UTF-8")
}
