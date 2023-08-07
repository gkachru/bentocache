/*
 * @adonisjs/cache
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { defu } from 'defu'
import { getActiveTest } from '@japa/runner'

import { Cache } from '../src/cache.js'
import { Redis } from '../src/drivers/redis.js'
import { Memory } from '../src/drivers/memory.js'
import { MemoryBus } from '../src/bus/drivers/memory_bus.js'
import type { BusDriver, CacheDriver } from '../src/types/main.js'
import { createIsomorphicDestructurable } from '../src/helpers.js'
import type { Emitter, GracefulRetainOptions } from '../src/types/main.js'

type FactoryParameters = {
  emitter: Emitter
  ttl: number
  gracefulRetain: GracefulRetainOptions
  earlyExpiration: number
}

/**
 * Creates a new cache instance for easy and quick
 * testing
 */
export class CacheFactory {
  /**
   * The underlying local cache driver to use
   */
  #localDriver?: CacheDriver

  /**
   * The underlying remote cache driver to use
   */
  #remoteDriver?: CacheDriver

  /**
   * The underlying bus driver to use
   */
  #busDriver?: BusDriver

  /**
   * The default parameters
   */
  #parameters: Partial<FactoryParameters> = {
    gracefulRetain: { enabled: false },
  }

  /**
   * Instantiate and return the local driver
   */
  #createLocalDriver() {
    if (this.#localDriver) return this.#localDriver
    return new Memory({ maxSize: 100, ttl: this.#parameters.ttl, prefix: 'test' })
  }

  /**
   * Instantiate and return the remote driver   *
   */
  #createRemoteDriver() {
    if (this.#remoteDriver) return this.#remoteDriver

    // TODO: maybe try replace with memory remote driver
    return new Redis({ connection: { host: '127.0.0.1', port: 6379 }, prefix: 'test' })
  }

  /**
   * Merge custom parameters with the default parameters
   */
  merge(parameters: Partial<FactoryParameters>) {
    this.#parameters = defu(parameters, this.#parameters)
    return this
  }

  /**
   * Apply the hybrid driver configuration to the factory
   */
  withHybridConfig(remoteDriver?: CacheDriver) {
    this.#localDriver = this.#createLocalDriver()
    this.#remoteDriver = remoteDriver ?? this.#createRemoteDriver()
    this.#busDriver = new MemoryBus()

    return this
  }

  /**
   * Create the final cache instance
   *
   * @param autoCleanup Whether to automatically cleanup the cache instance after the test
   */
  create(autoCleanup = true) {
    const local = this.#createLocalDriver()
    const remote = this.#createRemoteDriver()

    const cache = new Cache('primary', {
      localDriver: local,
      remoteDriver: remote,
      busDriver: this.#busDriver,
      emitter: this.#parameters.emitter,
      ttl: this.#parameters.ttl,
      gracefulRetain: this.#parameters.gracefulRetain ?? { enabled: false },
      earlyExpiration: this.#parameters.earlyExpiration,
    })

    if (autoCleanup) {
      getActiveTest()?.cleanup(async () => {
        await cache.clear().catch(() => {})
        await cache.disconnect().catch(() => {})
      })
    }

    return createIsomorphicDestructurable(
      { cache, local, remote } as const,
      [cache, local, remote] as const
    )
  }
}
