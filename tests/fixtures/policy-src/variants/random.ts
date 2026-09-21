import { definePolicy } from '../stub-sdk.ts'

// Math.random() in a comment is not flagged.
export const roll = (): number => Math.floor(Math.random() * 6)

export default definePolicy({ id: 'random' })
