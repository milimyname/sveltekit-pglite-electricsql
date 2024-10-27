export interface JMDictEntry {
  ent_seq: string[]
  k_ele?: Array<{
    keb: string[]
    ke_pri?: string[]
  }>
  r_ele: Array<{
    reb: string[]
    re_pri?: string[]
  }>
  sense: Array<{
    pos?: string[]
    gloss: string[]
  }>
}

export interface WordFrequency {
  frequency: number | null // from nf tags
  isNewsRanked: boolean // has news1/2
  isIchiRanked: boolean // has ichi1/2
  isCommon: boolean // overall commonness
}
