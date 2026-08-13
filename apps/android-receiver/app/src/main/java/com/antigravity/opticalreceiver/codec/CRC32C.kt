package com.antigravity.opticalreceiver.codec

object CRC32C {
    private val table = IntArray(256)

    init {
        for (i in 0 until 256) {
            var c = i
            for (k in 0 until 8) {
                c = if ((c and 1) != 0) (0x82F63B78.toInt() xor (c ushr 1)) else (c ushr 1)
            }
            table[i] = c
        }
    }

    fun calculate(data: ByteArray, seed: Int = 0): Long {
        var crc = seed xor 0xFFFFFFFF.toInt()
        for (b in data) {
            val byteVal = b.toInt() and 0xFF
            crc = (crc ushr 8) xor table[(crc xor byteVal) and 0xFF]
        }
        return (crc xor 0xFFFFFFFF.toInt()).toLong() and 0xFFFFFFFFL
    }
}
