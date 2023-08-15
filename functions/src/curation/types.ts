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
    action: z.literal('createList'),
    data: z.object({
        profile: z.string(),
        name: z.string(),
    }),
})

export const RenameCurationListInput = z.object({
    action: z.literal('renameList'),
    data: z.object({
        id: z.string(),
        profile: z.string(),
        name: z.string(),
    }),
})

export const RemoveCurationListInput = z.object({
    action: z.literal('removeList'),
    data: z.object({
        profile: z.string(),
        id: z.string(),
    }),
})

export const AddProfileToCurationListInput = z.object({
    action: z.literal('addProfileToList'),
    data: z.object({
        profile: z.string(),
        id: z.string(),
        profileToAdd: z.string(),
    }),
})

export const RemoveProfileFromCurationListInput = z.object({
    action: z.literal('removeProfileFromList'),
    data: z.object({
        profile: z.string(),
        id: z.string(),
        profileToRemove: z.string(),
    }),
})

export const CurationRequest = z.union([
    CreateCurationListInput,
    RenameCurationListInput,
    RemoveCurationListInput,
    AddProfileToCurationListInput,
    RemoveProfileFromCurationListInput,
])

export type ICurationRequest = z.infer<typeof CurationRequest>
export type ICreateCurationListInput = z.infer<typeof CreateCurationListInput>
export type IRenameCurationListInput = z.infer<typeof RenameCurationListInput>
export type IRemoveCurationListInput = z.infer<typeof RemoveCurationListInput>
export type IAddProfileToCurationListInput = z.infer<typeof AddProfileToCurationListInput>
export type IRemoveProfileFromCurationListInput = z.infer<typeof RemoveProfileFromCurationListInput>
