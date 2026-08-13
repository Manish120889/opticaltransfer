package com.antigravity.opticalreceiver.codec

import kotlin.math.ln
import kotlin.math.sqrt

data class FountainPacket(
    val seed: Int,
    val degree: Int,
    val blockIndices: List<Int>,
    val data: ByteArray
)

class SeededRandom(seed: Int) {
    private var state: Long = seed.toLong() and 0xFFFFFFFFL

    fun nextFloat(): Double {
        state = (state * 1664525L + 1013904223L) and 0xFFFFFFFFL
        return state.toDouble() / 4294967296.0
    }

    fun nextInt(max: Int): Int {
        return (nextFloat() * max).toInt()
    }
}

class FountainDecoder(
    val K: Int,
    val blockSize: Int,
    val originalSize: Int
) {
    private val decodedBlocks = arrayOfNulls<ByteArray>(K)
    private var decodedCount = 0
    private var receivedPacketsCount = 0
    private val cdf: DoubleArray = generateRobustSolitonCDF(K)
    private val equations = mutableListOf<Equation>()

    private class Equation(
        val indices: MutableSet<Int>,
        val data: ByteArray
    )

    fun getDecodedBlocksCount(): Int = decodedCount
    fun getReceivedPacketsCount(): Int = receivedPacketsCount
    fun getProgress(): Float = (decodedCount.toFloat() / K.toFloat()) * 100f
    fun isComplete(): Boolean = decodedCount == K

    fun addPacket(packet: FountainPacket): Boolean {
        receivedPacketsCount++
        if (isComplete()) return true

        var indicesList = packet.blockIndices
        if (indicesList.isEmpty()) {
            indicesList = if (packet.seed <= K) {
                listOf(packet.seed - 1)
            } else {
                val rng = SeededRandom(packet.seed)
                val rand = rng.nextFloat()
                var deg = 1
                for (i in 1..K) {
                    if (rand <= cdf[i]) {
                        deg = i
                        break
                    }
                }
                val set = mutableSetOf<Int>()
                while (set.size < deg) {
                    set.add(rng.nextInt(K))
                }
                set.toList()
            }
        }

        val indices = mutableSetOf<Int>()
        val data = packet.data.copyOf()

        for (idx in indicesList) {
            if (decodedBlocks[idx] != null) {
                val solved = decodedBlocks[idx]!!
                for (b in 0 until blockSize) {
                    data[b] = (data[b].toInt() xor solved[b].toInt()).toByte()
                }
            } else {
                indices.add(idx)
            }
        }

        if (indices.isEmpty()) return isComplete()

        equations.add(Equation(indices, data))
        solveBeliefPropagation()

        return isComplete()
    }

    private fun solveBeliefPropagation() {
        var progress = true

        while (progress && !isComplete()) {
            progress = false
            val iterator = equations.iterator()

            while (iterator.hasNext()) {
                val eq = iterator.next()
                if (eq.indices.size == 1) {
                    val solvedIdx = eq.indices.first()

                    if (decodedBlocks[solvedIdx] == null) {
                        decodedBlocks[solvedIdx] = eq.data.copyOf()
                        decodedCount++
                        progress = true

                        val solvedData = eq.data
                        for (targetEq in equations) {
                            if (targetEq === eq) continue
                            if (targetEq.indices.contains(solvedIdx)) {
                                targetEq.indices.remove(solvedIdx)
                                for (b in 0 until blockSize) {
                                    targetEq.data[b] = (targetEq.data[b].toInt() xor solvedData[b].toInt()).toByte()
                                }
                            }
                        }
                    }
                    iterator.remove()
                }
            }
        }
    }

    fun assemblePayload(): ByteArray? {
        if (!isComplete()) return null
        val result = ByteArray(originalSize)
        for (i in 0 until K) {
            val block = decodedBlocks[i]!!
            val start = i * blockSize
            val length = minOf(blockSize, originalSize - start)
            System.arraycopy(block, 0, result, start, length)
        }
        return result
    }

    companion object {
        fun generateRobustSolitonCDF(K: Int, c: Double = 0.1, delta: Double = 0.05): DoubleArray {
            val probs = DoubleArray(K + 1)
            probs[1] = 1.0 / K.toDouble()
            for (i in 2..K) {
                probs[i] = 1.0 / (i.toDouble() * (i - 1).toDouble())
            }

            val S = c * ln(K.toDouble() / delta) * sqrt(K.toDouble())
            val rLimit = (K.toDouble() / S).toInt()

            for (i in 1..K) {
                if (i < rLimit) {
                    probs[i] += S / (K.toDouble() * i.toDouble())
                } else if (i == rLimit) {
                    probs[i] += (S * ln(S / delta)) / K.toDouble()
                }
            }

            var sum = 0.0
            for (i in 1..K) sum += probs[i]

            val cdf = DoubleArray(K + 1)
            var acc = 0.0
            for (i in 1..K) {
                acc += probs[i] / sum
                cdf[i] = acc
            }
            cdf[K] = 1.0
            return cdf
        }
    }
}
