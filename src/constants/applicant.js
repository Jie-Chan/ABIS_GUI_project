export const FINGER_POSITIONS = [
  { key: 'left_thumb', label: '左手拇指', hand: '左手' },
  { key: 'left_index', label: '左手食指', hand: '左手' },
  { key: 'left_middle', label: '左手中指', hand: '左手' },
  { key: 'left_ring', label: '左手无名指', hand: '左手' },
  { key: 'left_little', label: '左手小指', hand: '左手' },
  { key: 'right_thumb', label: '右手拇指', hand: '右手' },
  { key: 'right_index', label: '右手食指', hand: '右手' },
  { key: 'right_middle', label: '右手中指', hand: '右手' },
  { key: 'right_ring', label: '右手无名指', hand: '右手' },
  { key: 'right_little', label: '右手小指', hand: '右手' },
]
export const fingerLabel = key => FINGER_POSITIONS.find(position => position.key === key)?.label || '指位未标注'
