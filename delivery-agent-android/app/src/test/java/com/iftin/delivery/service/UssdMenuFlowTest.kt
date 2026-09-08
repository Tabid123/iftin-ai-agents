package com.iftin.delivery.service

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UssdMenuFlowTest {
    private val menu = """
        --Maamuus--
        1. $0.15=Internet aan xadidnayn, 3 Saac
        2. $0.5=Internet aan xadidnayn,20 Saac
        3. $0.1=Internet aan xadidnayn, 1 Saac
        4. $0.25=Internet aan xadidnayn, 8 Saac
    """.trimIndent()

    @Test fun exactDurationsNeverCrossMatch() {
        assertEquals(1, UssdMenuFlow.findNumberForKeywords(menu, listOf("Internet aan xadidnayn 3 Saac")))
        assertEquals(2, UssdMenuFlow.findNumberForKeywords(menu, listOf("Internet aan xadidnayn 20 Saac")))
        assertEquals(4, UssdMenuFlow.findNumberForKeywords(menu, listOf("Unlimited Internet 8 Hours")))
        assertNull(UssdMenuFlow.findNumberForKeywords(menu, listOf("Unlimited Internet 12 Hours")))
    }

    @Test fun pipeFlattenedAccessibilityRowsAreParsed() {
        val flat = "--Maamuus-- | 1. $0.15=Internet aan xadidnayn, 3 Saac | 2. $0.25=Internet aan xadidnayn, 8 Saac | Cancel | Send"
        assertEquals(2, UssdMenuFlow.findNumberForKeywords(flat, listOf("Internet aan xadidnayn 8 Saac")))
        assertTrue(UssdMenuFlow.isPackageMenuDialog(flat))
    }

    @Test fun prefixesAndDialPartsAreSeparatedFromMenuPaths() {
        assertEquals("*870*", UssdMenuFlow.dialPrefix("*870*612345678#|Data,8 Saac"))
        assertEquals("*866*", UssdMenuFlow.dialPrefix("*866*612345678#|Data,8 Saac"))
        assertEquals("*212*", UssdMenuFlow.dialPrefix("*212*612345678#|Data,8 Saac"))
        assertEquals("*870*612345678#", UssdMenuFlow.stripMenuSuffix("*870*612345678#|Data,8 Saac"))
        assertEquals(listOf("Data", "8 Saac"), UssdMenuFlow.parseMenuPath("*870*612345678#|Data,8 Saac"))
    }

    @Test fun somtel101NeverDialsReceiverInInitialCode() {
        assertEquals("*101#", UssdMenuFlow.triggerCode("612345678", "*101*"))
        assertEquals("*101#", UssdMenuFlow.triggerCode("+252612345678", "*101*"))
        assertEquals("*101*", UssdMenuFlow.dialPrefix("*101#|1,1"))
        assertTrue(UssdMenuFlow.isMenuFlow("*101#"))
    }

    @Test fun allRequestedFlowsAreRegistered() {
        assertTrue(UssdMenuFlow.MENU_FLOW_PREFIXES.contains("*870*"))
        assertTrue(UssdMenuFlow.MENU_FLOW_PREFIXES.contains("*866*"))
        assertTrue(UssdMenuFlow.MENU_FLOW_PREFIXES.contains("*101*"))
        assertTrue(UssdMenuFlow.MENU_FLOW_PREFIXES.contains("*212*"))
        val receiver = UssdMenuFlow.STEPS.first { it.name == "receiver_phone" }
        val pin = UssdMenuFlow.STEPS.first { it.name == "pin" }
        assertTrue(receiver.order > pin.order)
        assertFalse(receiver.isPinField)
    }
}
