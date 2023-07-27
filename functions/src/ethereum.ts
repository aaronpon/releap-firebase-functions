import { createPublicClient, http } from 'viem'
import { zkSync, zkSyncTestnet } from 'viem/chains'
import evmContractABI from './ethereum/evmContractABI.json'
import { logger } from 'firebase-functions/v1'

export const checkAddressOwnsProfileName = async (address: string, profileName: string) => {
    const client = createPublicClient({
        chain: process.env.EVM_NETWORK == 'zkSyncTestnet' ? zkSyncTestnet : zkSync,
        transport: http(),
    })
    try {
        const evmContract = process.env.EVM_CONTRACT as `0x${string}`
        const data = await client.readContract({
            address: evmContract,
            abi: evmContractABI.abi,
            functionName: 'getOwnerOfProfileName',
            args: [profileName],
        })
        logger.info(`Checking if address owns: ${address} ${profileName} `, address == data)
        return address == data
    } catch (e) {
        logger.error('ERROR: ', e)
        return false
    }
}

export const getAllProfilenames = async (address: string) => {
    const client = createPublicClient({
        chain: process.env.EVM_NETWORK == 'zkSyncTestnet' ? zkSyncTestnet : zkSync,
        transport: http(),
    })

    try {
        const evmContract = process.env.EVM_CONTRACT as `0x${string}`
        const data = (await client.readContract({
            address: evmContract,
            abi: evmContractABI.abi,
            functionName: 'balanceOf',
            args: [address],
        })) as bigint
        const profileNameList = []
        if (data.valueOf() > 0) {
            for (let i = 0; i < data.valueOf(); i++) {
                const tokenId = await client.readContract({
                    address: evmContract,
                    abi: evmContractABI.abi,
                    functionName: 'tokenOfOwnerByIndex',
                    args: [address, i],
                })
                const profileName = await client.readContract({
                    address: evmContract,
                    abi: evmContractABI.abi,
                    functionName: 'getProfileNameByTokenId',
                    args: [tokenId],
                })
                profileNameList.push(profileName)
            }
        }
        logger.info(`Profile name list: ${profileNameList}`)
        return profileNameList
    } catch (e) {
        logger.info(`error: ${e}`)
        return null
    }
}

export const getFirstProfileName = async (address: string): Promise<string | null> => {
    const client = createPublicClient({
        chain: process.env.EVM_NETWORK == 'zkSyncTestnet' ? zkSyncTestnet : zkSync,
        transport: http(),
    })

    try {
        const evmContract = process.env.EVM_CONTRACT as `0x${string}`

        const balance = (await client.readContract({
            address: evmContract,
            abi: evmContractABI.abi,
            functionName: 'balanceOf',
            args: [address],
        })) as bigint

        console.log('Balance of EVM Profile Name: ', Number(balance))

        if (Number(balance) > 0) {
            const tokenId = await client.readContract({
                address: evmContract,
                abi: evmContractABI.abi,
                functionName: 'tokenOfOwnerByIndex',
                args: [address, 0],
            })

            const profileName = (await client.readContract({
                address: evmContract,
                abi: evmContractABI.abi,
                functionName: 'getProfileNameByTokenId',
                args: [tokenId],
            })) as string

            return profileName
        } else {
            return null
        }
    } catch (e) {
        logger.info(`error: ${e}`)
        return null
    }
}
