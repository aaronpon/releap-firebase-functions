import z from 'zod'

export const QuestSubmissionInput = z.object({
    questId: z.string(),
    data: z.string(),
    badgeId: z.string(),
    profileId: z.string(),
})

export const ApproveQuestInput = z.object({
    submissionId: z.string(),
    action: z.enum(['approve', 'reject'] as const),
})

export const CreateCampaginInput = z.object({
    badgeId: z.string(),
    name: z.string(),
    description: z.string(),
    maxSupply: z.number(),
    imageUrl: z.string(),
    profileId: z.string(),
    mintList: z.string().array().optional(),
    order: z.number().optional(),
    point: z.number().optional(),
    type: z.string().optional(),
    twitterQuest: z
        .object({
            twitterHandle: z.string(),
            like: z.string().optional(),
            reply: z.string().optional(),
            follow: z.string().optional(),
            retweet: z.string().optional(),
        })
        .optional(),
    suiQuests: z.object({ event: z.string() }).array().optional(),
    manualQuests: z
        .object({
            id: z.string().optional(),
            type: z.enum(['url', 'image', 'text'] as const),
            description: z.string(),
            data: z.string(),
        })
        .array()
        .optional(),
})
