// Official measures that switch on at 24-hr PSI bands, checked against agency sources on
// 16 Oct 2026. `basis` says whether the agency acts on the next-day forecast or the
// current reading; tiers are PSI bands: 101-200, 201-300, >300. Only rules confirmed in
// the agency's own text are listed. Update `checked` when re-verifying.
export const checked = '2026-10-16';
export const TIERS = [
  { id: 'unhealthy', min: 101, max: 200 },
  { id: 'veryUnhealthy', min: 201, max: 300 },
  { id: 'hazardous', min: 301, max: Infinity },
];
export const tierOf = psi => TIERS.findIndex(t => psi >= t.min && psi <= t.max);

export const rules = [
  {
    id: 'moe', basis: 'forecast',
    url: 'https://www.moe.gov.sg/about-us/emergency-preparedness/haze-management',
    zh: { agency: 'MOE · 中小学', tiers: [
      '避免剧烈的户外体力活动；身体不适或有心肺疾病的学生免除所有户外体力活动。',
      '避免户外活动和室内体力活动；全体学生留在装有空气净化器的密闭室内。',
      '次日预报为危险级时，MOE 会考虑停课，并在发布健康建议前后宣布。上课时段 PSI 超过 300：停止体力活动并缩减课程；停课期间无法安排看护的家长仍可送孩子到校，由老师照看；全国考试改期。',
    ] },
    en: { agency: 'MOE · Schools', tiers: [
      'Avoid strenuous outdoor physical activities; students who are unwell or have lung or heart conditions are exempted from all outdoor physical activities.',
      'Avoid outdoor activities and indoor physical activities; all students stay in enclosed indoor spaces with air purifiers.',
      'MOE will consider closing schools when the next-day forecast is Hazardous, announced around when the health advisory is released. Above 300 during school hours: no physical activities and lessons scaled down. If schools close, parents without other care may still send children, supervised by teachers; national exams are rescheduled.',
    ] },
  },
  {
    id: 'ecda', basis: 'reading',
    url: 'https://www.nea.gov.sg/media/news/news/index/singapore-ready-to-step-up-haze-response',
    zh: { agency: 'ECDA · 学前教育', tiers: [
      null,
      '停止所有户外活动和剧烈的室内活动；有慢性心肺疾病的孩子免除所有室内体力活动。每所学前机构须准备至少一间配有空气净化器的密闭房间。',
      null,
    ] },
    en: { agency: 'ECDA · Preschools', tiers: [
      null,
      'All outdoor activities and strenuous indoor activities stop; children with chronic heart or lung conditions are exempted from all indoor physical activities. Each preschool keeps at least one enclosed room with air purifiers.',
      null,
    ] },
  },
  {
    id: 'mom', basis: 'reading',
    url: 'https://www.mom.gov.sg/haze/guidelines-on-protecting-employees-from-haze',
    zh: { agency: 'MOM · 雇主与户外工作', tiers: [
      '健康员工减少长时间或剧烈的户外工作；长者和孕妇尽量减少；慢性心肺病患者避免。',
      '健康员工避免长时间或剧烈的户外工作；长者和孕妇尽量减少户外工作；慢性心肺病患者避免户外工作。无法避免时，强烈要求雇主提供口罩（如 N95）。',
      '健康员工尽量减少户外工作；长者、孕妇和慢性心肺病患者避免户外工作。无法避免时应提供口罩或合适的呼吸器（PSI 超过 400 的长时间户外工作用全面罩呼吸器）。',
    ] },
    en: { agency: 'MOM · Employers & outdoor work', tiers: [
      'Healthy employees reduce prolonged or strenuous outdoor work; the elderly and pregnant minimise it; those with chronic lung or heart disease avoid it.',
      'Healthy employees avoid prolonged or strenuous outdoor work; the elderly and pregnant minimise outdoor work; those with chronic lung or heart disease avoid it. If it cannot be avoided, employers are strongly urged to provide masks (e.g. N95).',
      'Healthy employees minimise outdoor work; the elderly, pregnant and those with chronic lung or heart disease avoid it. If unavoidable, masks or suitable respirators should be provided (full-face respirators for prolonged outdoor work above PSI 400).',
    ] },
  },
  {
    id: 'sportsg', basis: 'forecast',
    url: 'https://www.activesgcircle.gov.sg/facilities/sport-centres/facilities-closure',
    zh: { agency: 'SportSG · ActiveSG 体育设施', tiers: [
      '设施有条件开放。',
      '户外和非空调体育设施关闭，相关活动暂停；空调设施可继续开放。',
      '体育设施关闭，包括 ActiveSG 体育中心的所有设施。',
    ] },
    en: { agency: 'SportSG · ActiveSG facilities', tiers: [
      'Facilities operate with conditions.',
      'Outdoor and non-air-conditioned facilities close and organised activities there are suspended; air-conditioned facilities may stay open.',
      'Sport facilities close, including all facilities at ActiveSG Sport Centres.',
    ] },
  },
  {
    id: 'pa', basis: 'reading',
    url: 'https://www.nea.gov.sg/media/news/advisories/index/haze-situation-update-14-october-2026',
    zh: { agency: 'PA · 避霾中心', tiers: [
      null,
      '民众俱乐部和部分居民委员会、居民网络中心开放空调室作为避霾中心。',
      'CC 避霾中心开放到晚上 10 点。',
    ] },
    en: { agency: 'PA · Haze shelters', tiers: [
      null,
      'Air-conditioned rooms at Community Clubs and selected RC and RN centres open as haze shelters.',
      'CC haze shelters stay open until 10 pm.',
    ] },
  },
];
