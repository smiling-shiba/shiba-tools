import { definePolicy } from '../stub-sdk.ts'

// localeCompare() in a comment is not flagged.
export const order = (a: string, b: string): number => a.localeCompare(b)
export const show = (n: number): string => n.toLocaleString('en-US')
export const format = new Intl.NumberFormat('en-US')

export default definePolicy({ id: 'locale' })
