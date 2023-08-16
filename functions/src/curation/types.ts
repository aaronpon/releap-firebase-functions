import z from 'zod'

// Create list
// Rename list
// Delete list
// Add item to list
// Remove item from list

export const CurationList = z
    .object({
        id: z.string().optional(),
        name: z.string(),
        followedProfiles: z.string().array(),
    })
    .array()

export const CreateCurationListInput = z.object({
    profile: z.string(),
    name: z.string(),
})

export const RenameCurationListInput = z.object({
    profile: z.string(),
    name: z.string(),
})

export const RemoveCurationListInput = z.object({
    profile: z.string(),
})

export const AddProfileToCurationListInput = z.object({
    profile: z.string(),
    profileToAdd: z.string(),
})

export const RemoveProfileFromCurationListInput = z.object({
    profile: z.string(),
})

export type ICreateCurationListInput = z.infer<typeof CreateCurationListInput>
export type IRenameCurationListInput = z.infer<typeof RenameCurationListInput>
export type IRemoveCurationListInput = z.infer<typeof RemoveCurationListInput>
export type IAddProfileToCurationListInput = z.infer<typeof AddProfileToCurationListInput>
export type IRemoveProfileFromCurationListInput = z.infer<typeof RemoveProfileFromCurationListInput>
