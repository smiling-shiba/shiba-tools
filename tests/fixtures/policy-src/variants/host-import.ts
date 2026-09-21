import { readFileSync } from 'node:fs'
import { definePolicy } from '../stub-sdk.ts'

readFileSync('anything')
export default definePolicy({ id: 'host' })
