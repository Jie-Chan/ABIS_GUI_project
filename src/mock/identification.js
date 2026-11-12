/** 新增的两组当前已入库对象，与历史响应分别保存，避免候选图像串号。 */
export const MULTI_CANDIDATE_CASES = [
  { userId: 'U009', feature: 'finger', fingerPosition: 'left_index', api: 'identification', candidates: [
    { userId: 'U101', rank: 1, score: 97.5, fingerPosition: 'left_index' },
    { userId: 'U102', rank: 2, score: 92.3, fingerPosition: 'left_index' },
    { userId: 'U103', rank: 3, score: 86.8, fingerPosition: 'left_index' },
  ] },
  { userId: 'U010', feature: 'face', api: 'identification', candidates: [
    { userId: 'U201', rank: 1, score: 98.2 },
    { userId: 'U202', rank: 2, score: 94.6 },
    { userId: 'U203', rank: 3, score: 89.1 },
  ] },
]
