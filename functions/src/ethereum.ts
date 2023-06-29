import { createPublicClient, http } from 'viem'
import { zkSyncTestnet } from 'viem/chains'
import evmContractABI from './ethereum/evmContractABI.json'
import { logger } from 'firebase-functions/v1'

export const checkAddressOwnsProfileName = async (address: string, profileName: string) => {
    const client = createPublicClient({
        chain: zkSyncTestnet,
        transport: http(),
    })
    logger.info(`Checking address ownership: ${address} ${profileName}`)
    try {
        const evmContract = process.env.EVM_CONTRACT as `0x${string}`
        const data = await client.readContract({
            address: evmContract,
            abi: evmContractABI.abi,
            functionName: 'getOwnerOfProfileName',
            args: [profileName],
        })
        return address == data
    } catch (e) {
        return false
    }
}

export const getAllProfilenames = async (address: string) => {
    const client = createPublicClient({
        chain: zkSyncTestnet,
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
        chain: zkSyncTestnet,
        transport: http(),
    })

    try {
        const evmContract = process.env.EVM_CONTRACT as `0x${string}`

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
    } catch (e) {
        logger.info(`error: ${e}`)
        return null
    }
}
