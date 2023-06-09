import admin from 'firebase-admin'

export const getTwitterScraperProfiles = async () => {
    const db = admin.firestore()
    const snapshot = await db.collection('twitterScraper').orderBy('lastUpdate', 'asc').limit(1).get()
    const result = snapshot.docs.map((doc) => doc.data())
    return result
}

export const updateLastScrap = async (profileName: string, createdAt: string) => {
    const db = admin.firestore()
    await db.collection('twitterScraper').doc(profileName).update({ lastUpdate: createdAt })
}
