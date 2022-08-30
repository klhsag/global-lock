/**
 * NodeJS Sync Tool Function
 *
 * This tool offers a lock which can be shared among different NodeJS instances.(even other programs)
 *
 * This lock is used to solve the problem of synchronizations of shared resources in system. It may not be used to synchronize frequent operations faster than I/O.
 * 
 * It's implemented within the file system. You should make sure that the created files won't confilct with others.
 * 
 * The lock spin itself in low frequency, and the operation to lock will take some file I/O time.
 * 
 * Implement Details:
 *    - Create a new file to lock, and delete the file to unlock.
 *    - Once the file is created, it cannot be created again before it's deleted, so that it works like a lock.
 *    - The lock will spin for many times until the lock is released somewhere else, or throw time out exception at last.
 *    - You may change the default parameters to control its behavior.
 *
 * Usage:
 *      sync_file_op = get_sync_file_op()       // generate a sync tool function with default settings
 *
 *      sync_file_op(                     // An async funtion for use
 *          filename,                     // Filename of the lock file to be created. It's used as the handle for this specific lock.
 *          opreration                    // A callback : the operations expected to be synchronized. (The callback function can be async or not.)
 *      )                                 //     the call will return the callback's return value at last.
 */

import path = require('path')
import fs = require('fs')

function micro_delay(delay_ms: number = 1): Promise<void> {
    return new Promise((resolve, _) => {
        setTimeout(() => {
            resolve(void 0)
        }, delay_ms)
    })
}

const gen_auto_micro_delay: (p_ini: number, p_restart: number, p_sup: number, p_try: number) => (weak_ptr: object) => Promise<void> =
    (p_ini, p_restart, p_sup, p_try) => {
        return ((p_ini: number, p_restart: number, p_sup: number, p_try: number) => {
            const mark = Date.now()
            const mapper = new WeakMap<object, number>()
            const mcnt = new WeakMap<object, number>()
            function __delay(weak_ptr: object) {
                const delay_ms = mapper.get(weak_ptr) ?? p_ini
                if (delay_ms >= p_sup) {
                    const cnt = mcnt.get(weak_ptr) ?? 0
                    if (cnt < p_try) {
                        mapper.set(weak_ptr, p_restart)
                        mcnt.set(weak_ptr, cnt + 1)
                        return micro_delay(Math.floor(delay_ms))
                    } else {
                        throw new Error(`Locked for too long. ( ${Date.now() - mark} ms )`)
                    }
                } else {
                    mapper.set(weak_ptr, delay_ms * (1 + Math.random()))
                    return micro_delay(Math.floor(delay_ms))
                }
            }
            return __delay
        })(p_ini, p_restart, p_sup, p_try)
    }

//const default_auto_delay = gen_auto_micro_delay(5, 25, 300, 7)

async function try_lock(filename: string) {
    const lockDir = path.dirname(filename)
    try {
        await fs.promises.mkdir(lockDir, { recursive: true })          //  auto  mkdir
    } catch (e) {
        // ignore. If something wrong happended actually, we may still get it afterwards.
    }
    const lock_fill_str = 'Lock File.\n'
    try {
        await fs.promises.writeFile(filename, lock_fill_str, { flag: 'wx' })
        return true
    } catch (e) {
        // console.log('Fail.')
        return false
    }
}

async function auto_try_lock(filename: string, auto_delay: (weak_ptr: object) => Promise<void>) {
    const delay_flag = {}
    while (!(await try_lock(filename))) {
        const _ = await auto_delay(delay_flag)
    }
    return
}

function unlock(filename: string) {
    return fs.promises.unlink(filename)
}

function ret_API(options?: { p_ini?: number, p_restart?: number, p_sup?: number, p_try?: number }) {
    var { p_ini, p_restart, p_sup, p_try } = options || {}
    p_ini ||= 1
    p_restart ||= 20
    p_sup ||= 600
    p_try ||= 8
    const delayer = gen_auto_micro_delay(p_ini, p_restart, p_sup, p_try)
    async function syncFileOp<T>(filename: string, operation: () => T | Promise<T>): Promise<T> {
        await auto_try_lock(filename, delayer)
        try {
            const res = await operation()
            await unlock(filename)
            return res
        } catch (e) {
            await unlock(filename)
            throw e
        }
    }
    return syncFileOp
}

export = {
    get_sync_file_op: ret_API
}
