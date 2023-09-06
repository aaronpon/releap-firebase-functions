import z from 'zod'

// Create list
// Update list
// Delete list

export const CurationList = z
    .object({
        id: z.string(),
        name: z.string(),
        followedProfiles: z.string().array(),
    })
    .array()

export const CreateCurationListInput = z.object({
    // user profile
    profile: z.string().nonempty(),
    name: z.string().nonempty(),
    followedProfileNames: z.string().nonempty().array().nonempty(),
})

export const UpdateCurationListInput = z.object({
    profile: z.string().nonempty(),
    name: z.string().nonempty(),
    followedProfileNames: z.string().nonempty().array().nonempty(),
})

export const RemoveCurationListInput = z.object({
    profile: z.string(),
})

export type ICreateCurationListInput = z.infer<typeof CreateCurationListInput>
export type IUpdateCurationListInput = z.infer<typeof UpdateCurationListInput>
export type IRemoveCurationListInput = z.infer<typeof RemoveCurationListInput>
