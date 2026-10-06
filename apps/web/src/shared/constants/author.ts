/**
 * The expert who signs the public articles.
 *
 * A constant rather than a profile in the database: there is one author of
 * public articles, and the account the articles were created under is an
 * internal name ("Красный Кот") that no reader should see. Curators write for
 * their own clients, and those articles are not public.
 *
 * If somebody else starts publishing to everyone, this is the place that has
 * to become author profiles — see openspec/changes/article-expert-author.
 */
export interface ExpertAuthor {
    name: string
    initials: string
    jobTitle: string
    /** Path under /public. Absent until the photo is supplied. */
    photo?: string
    path: string
}

export const EXPERT_AUTHOR: ExpertAuthor = {
    name: 'Сергей Бурцев',
    initials: 'СБ',
    jobTitle: 'Спортивный практикующий тренер, мастер спорта по тяжёлой атлетике',
    photo: undefined,
    path: '/avtor/sergey-burcev',
}
