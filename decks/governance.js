// The governance deck — what we ask a newsroom so its AI policy can be written
// from what is actually true there, rather than from a template.
//
// Twelve questions, four per policy layer, every one answerable in a single tap.
// Each option carries the finding it implies, so the deck is the configuration
// and the engine stays the logic. Tuning what we ask, or how an answer reads in
// a policy, is an edit to this file — not a code change and not a redeploy.
//
// On the wording: findings are written as affirmative statements of what IS the
// case, because they are read by the person whose newsroom it is. "Sensitive
// interviews are transcribed in a cloud tool" is usable. "The newsroom does not
// have adequate transcription controls" is a telling-off.

import { defineDeck } from '../src/deck.js';

export const governanceDeck = defineDeck({
  key: 'governance',
  title: 'Twelve questions about AI here',
  subjectKind: 'newsroom',
  questions: [
    // ── ETHICS ────────────────────────────────────────────────────────────
    {
      key: 'ai_uses',
      layer: 'ethics',
      kind: 'multi',
      ask: 'Which of these is already happening here?',
      help: 'Tick everything, including anything people do quietly.',
      options: [
        { value: 'transcription', label: 'Transcribing interviews', finding: 'AI transcription is in use, so the policy must say where recordings may be sent.' },
        { value: 'translation',   label: 'Translation',             finding: 'AI translation is in use.' },
        { value: 'drafting',      label: 'Drafting copy',           finding: 'AI is used in drafting, so the policy needs a human-review rule before publication.' },
        { value: 'headlines',     label: 'Headlines or summaries',  finding: 'AI writes headlines or summaries, which is audience-facing and needs a disclosure position.' },
        { value: 'images',        label: 'Images or illustration',  finding: 'AI images are in use, which needs a labelling rule.' },
        { value: 'research',      label: 'Research and background', finding: 'AI is used for research, so the policy needs a verification rule.' },
        { value: 'none',          label: 'None that I know of',     unknown: true },
      ],
    },
    {
      key: 'disclosure',
      layer: 'ethics',
      kind: 'single',
      ask: 'Do you tell your audience when AI was involved?',
      options: [
        { value: 'always',    label: 'Always',            finding: 'The newsroom already discloses AI use, so the policy records an existing practice rather than introducing one.' },
        { value: 'sometimes', label: 'Sometimes',         finding: 'Disclosure happens case by case, so the policy needs to say which cases.' },
        { value: 'never',     label: 'Never',             finding: 'AI use is not disclosed to the audience. The policy has to state that position and its reasoning, because readers may later ask.' },
        { value: 'undecided', label: "We haven't decided", unknown: true },
      ],
    },
    {
      key: 'who_decides',
      layer: 'ethics',
      kind: 'single',
      ask: 'Who decides whether AI can be used on a story?',
      options: [
        { value: 'editor',     label: 'An editor',            finding: 'Editorial sign-off already exists for AI use and the policy should name that role.' },
        { value: 'journalist', label: 'Each journalist',      finding: 'AI decisions sit with individual journalists, so the policy has to be usable by one person under deadline.' },
        { value: 'nobody',     label: 'Nobody decides',       finding: 'No one currently decides whether AI may be used on a story. The policy needs to create that decision point.' },
        { value: 'it',         label: 'IT or technical staff', finding: 'AI decisions sit with technical staff rather than editorial, which the policy should reconcile.' },
        { value: 'unsure',     label: "I'm not sure",         unknown: true },
      ],
    },
    {
      key: 'disagreement',
      layer: 'ethics',
      kind: 'single',
      ask: 'Has AI use caused a disagreement here?',
      options: [
        { value: 'yes',     label: 'Yes',                finding: 'AI use has already caused a disagreement, so the policy is settling a live question rather than a hypothetical one.' },
        { value: 'no',      label: 'No',                 finding: null },
        { value: 'unknown', label: 'Not that I know of', unknown: true },
      ],
    },

    // ── LEGAL ─────────────────────────────────────────────────────────────
    {
      key: 'jurisdiction',
      layer: 'legal',
      kind: 'single',
      ask: 'Whose data protection law applies to you?',
      help: 'Where the newsroom is registered, not where your readers are.',
      options: [
        { value: 'ZA',      label: 'South Africa',   finding: 'POPIA applies: an Information Officer must be appointed and a breach reported to the Information Regulator within 72 hours.' },
        { value: 'KE',      label: 'Kenya',          finding: "Kenya's Data Protection Act applies." },
        { value: 'ZW',      label: 'Zimbabwe',       finding: "Zimbabwe's Cyber and Data Protection Act applies." },
        { value: 'NG',      label: 'Nigeria',        finding: 'The Nigeria Data Protection Act applies.' },
        { value: 'other',   label: 'Somewhere else', finding: 'The applicable data protection statute needs naming before the legal layer can cite anything.' },
        { value: 'unsure',  label: "I'm not sure",   unknown: true },
      ],
    },
    {
      key: 'accountable_person',
      layer: 'legal',
      kind: 'single',
      ask: 'Is one named person accountable for AI here?',
      options: [
        { value: 'yes',    label: 'Yes',          finding: 'A named person is already accountable for AI, and the policy should record who.' },
        { value: 'no',     label: 'No',           finding: 'Nobody is accountable for AI use. Every framework the policy cites requires a named owner, so the policy has to create the role.' },
        { value: 'unsure', label: "I'm not sure", unknown: true },
      ],
    },
    {
      key: 'tool_check',
      layer: 'legal',
      kind: 'single',
      ask: 'Do you check a tool before adopting it?',
      options: [
        { value: 'always',    label: 'Always',    finding: 'Tools are assessed before adoption, so the policy formalises an existing habit.' },
        { value: 'sometimes', label: 'Sometimes', finding: 'Tool checks happen inconsistently, so the policy needs a short approval step that survives a deadline.' },
        { value: 'never',     label: 'Never',     finding: 'Tools are adopted without assessment. The register and an approval step are the first controls to put in place.' },
        { value: 'unsure',    label: "I'm not sure", unknown: true },
      ],
    },
    {
      key: 'asked_about_ai',
      layer: 'legal',
      kind: 'single',
      ask: 'Has a regulator, funder or partner asked about your AI use?',
      options: [
        { value: 'yes',    label: 'Yes',          finding: 'Someone has already asked about AI use, so the policy is needed as evidence and not only as guidance.' },
        { value: 'no',     label: 'Not yet',      finding: null },
        { value: 'unsure', label: "I'm not sure", unknown: true },
      ],
    },

    // ── DATA SECURITY ─────────────────────────────────────────────────────
    {
      key: 'source_details',
      layer: 'data_security',
      kind: 'single',
      ask: 'Have source details ever gone into an AI tool?',
      help: 'Names, numbers, addresses, or anything that would identify someone.',
      options: [
        { value: 'yes',     label: 'Yes',        finding: 'Source details have reached an AI tool. This is the most serious finding in the deck: the policy needs a hard rule, and someone should check what that tool retains.' },
        { value: 'no',      label: 'No',         finding: 'Source details are kept out of AI tools, and the policy should write that down as a rule rather than a habit.' },
        { value: 'unknown', label: "Don't know", unknown: true },
      ],
    },
    {
      key: 'transcription_place',
      layer: 'data_security',
      kind: 'single',
      ask: 'Where do sensitive interviews get transcribed?',
      options: [
        { value: 'cloud',   label: 'A cloud tool',            finding: 'Sensitive interviews are transcribed in a cloud tool, so the policy needs to name which tool and what it may receive.' },
        { value: 'local',   label: 'Software on the machine', finding: 'Sensitive transcription happens locally, which is the safer arrangement and worth stating as the rule.' },
        { value: 'norecord', label: "We don't record them",   finding: 'Sensitive interviews are not recorded.' },
        { value: 'unknown', label: "Don't know",              unknown: true },
      ],
    },
    {
      key: 'two_factor',
      layer: 'data_security',
      kind: 'single',
      ask: 'Is two-factor login on for newsroom accounts?',
      options: [
        { value: 'all',     label: 'On everything', finding: 'Two-factor is on across newsroom accounts.' },
        { value: 'some',    label: 'On some',       finding: 'Two-factor is partial, so the accounts without it are the gap to close first.' },
        { value: 'none',    label: 'On nothing',    finding: 'Two-factor is not in use. This is the cheapest control available and belongs in the first round of fixes.' },
        { value: 'unknown', label: "Don't know",    unknown: true },
      ],
    },
    {
      key: 'ai_scam',
      layer: 'data_security',
      kind: 'single',
      ask: 'Has anyone here been targeted by an AI-assisted scam?',
      help: 'A cloned voice, a convincing fake email, a payment request that looked real.',
      options: [
        { value: 'yes',     label: 'Yes',        finding: 'Someone here has been targeted by an AI-assisted scam, so the threat section describes a real incident and out-of-band verification is a priority control.' },
        { value: 'no',      label: 'No',         finding: null },
        { value: 'unknown', label: "Don't know", unknown: true },
      ],
    },
  ],
});

export default governanceDeck;
