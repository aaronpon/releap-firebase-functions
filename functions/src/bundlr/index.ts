import express from 'express'
import { onRequest } from 'firebase-functions/v2/https'
import { commonOnRequestSettings, requestParser } from '../utils'
import Bundlr from '@bundlr-network/client'

const app = express()

app.post(
    '/file',
    requestParser({ requireAuth: undefined, parseFiles: true }, async (data) => {
        const bundlr = new Bundlr('https://node1.bundlr.network', 'matic', process.env.BUNDLR_WALLET as string)

        const totalSize = data.files.reduce((acc, curr) => acc + curr.buffer.length, 0)

        const price = await bundlr.getPrice(totalSize)
        const balance = await bundlr.getBalance(bundlr.address as string)

        // auto topup
        if (balance.lt(price)) {
            const value = bundlr.utils.toAtomic(1)
            await bundlr.fund(value)
        }

        const result: { filename: string; url: string }[] = []

        for (const file of data.files) {
            const tags = [{ name: 'Content-Type', value: file.mimeType }]
            const uploadRes = await bundlr.upload(file.buffer, { tags })
            const ext = file.filename.split('.').pop()
            result.push({ filename: file.filename, url: `https://arweave.net/${uploadRes.id}?ext=${ext}` })
        }

        return result
    }),
)

export const bundlr = onRequest(
    {
        ...commonOnRequestSettings,
        secrets: [...commonOnRequestSettings.secrets, 'BUNDLR_WALLET'],
    },
    app,
)
