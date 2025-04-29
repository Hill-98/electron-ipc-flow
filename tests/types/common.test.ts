import { expectType } from 'ts-expect'
import type { FunctionParameters, FunctionProperties, IpcEventListener } from '../../src/common.ts'

expectType<IpcEventListener<Electron.IpcMainEvent>>(() => void 0)
expectType<IpcEventListener<Electron.IpcMainInvokeEvent>>(() => void 0)
expectType<IpcEventListener<Electron.IpcRendererEvent>>(() => void 0)
expectType<IpcEventListener<Electron.IpcMainEvent, (a: string) => void>>(() => void 0)
// @ts-expect-error incorrect return type
expectType<IpcEventListener<Electron.IpcMain>>(() => '')
// @ts-expect-error incorrect parameter type
expectType<IpcEventListener<Electron.IpcMainEvent, (a: string) => void>>((_, a: number) => a)
expectType<IpcEventListener<Electron.IpcMainEvent, (a: string) => string>>(() => {})
expectType<IpcEventListener<Electron.IpcMainInvokeEvent, (a: string) => string>>(
  (_: Electron.IpcMainInvokeEvent, a: string) => a,
)
expectType<IpcEventListener<Electron.IpcMainInvokeEvent, (a: string) => string>>(
  (_: Electron.IpcMainInvokeEvent, a: string) => a,
)
// @ts-expect-error incorrect return type
expectType<IpcEventListener<Electron.IpcMainInvokeEvent, (a: string) => string>>(() => 1)

expectType<FunctionParameters<(a: string) => void>>([''])
expectType<FunctionParameters<any>>(['', 1, true])
// @ts-expect-error incorrect parameter type
expectType<FunctionParameters<(a: string) => void>>([1])

expectType<FunctionProperties<{ a: 1; b: () => void }>>('b')
// @ts-expect-error it should be ['a', 'b']
expectType<FunctionProperties<{ a: 1; b: () => void }>>('a')

expectType<FunctionProperties<{ a: 1 }>>(null as never)

expectType<FunctionProperties<null>>('')
