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
        const data = await client.readContract({
            address: '0x5B0AE94227Ef922d27C5E71e07f15Bd0e0FbDD3D',
            abi: evmContractABI.abi,
            functionName: 'getOwnerOfProfileName',
            args: [profileName],
        })
        return address == data
    } catch (e) {
        return false
    }
}
