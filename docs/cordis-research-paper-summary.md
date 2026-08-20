# Spatiotemporal Composability: Practical Summary for Implementers

## Core idea

The paper defines an architecture for systems whose components can be loaded, unloaded, replaced, and reconfigured while the process remains alive.

It separates dynamic composition into two dimensions:

- **Temporal composability:** when a component leaves, the runtime can retract the changes that component made without disturbing unrelated components.
- **Spatial composability:** components declare what they require and provide, and the runtime reacts as those dependencies appear, disappear, or change provider.

A compact way to remember the model is:

> A component declares what it needs, declares what it may provide, and performs shared-state changes through operations that return their own undo logic.

## 1. Revertible effects

An **effect** is a change a component makes to its environment:

- registering a tool
- installing an event listener
- adding a route
- opening a connection
- inserting an entry into a registry
- creating a child component
- modifying shared state

A revertible effect returns both its result and an inverse capable of retracting that particular change:

```ts
ctx.effect(() => {
  const handle = registry.add(value)

  return () => {
    registry.remove(handle)
  }
})
```

Conceptually:

```text
current context
    -> modified context
    + inverse for this modification
```

The runtime records each inverse as the effect occurs. The inverses are composed in last-in-first-out order, so a component's teardown is derived from its activation rather than maintained as a separate parallel program.

This changes cleanup from:

```text
remember to write a complete unload function later
```

into:

```text
every atomic mutation carries its cleanup locally
```

A component may perform many effects. Their inverses accumulate into one disposer representing everything that component currently owns.

## 2. Reactive coeffects

A **coeffect** is something a component requires from its environment:

```ts
export const inject = ['sessions', 'tools', 'llm']
```

A component activates only when all required services are available. Whenever the context changes, the runtime compares the component's previous dependency state with the new one and classifies the change as:

- **activating:** previously unsatisfied, now satisfied
- **deactivating:** previously satisfied, now unsatisfied
- **neutral:** satisfaction did not change

The runtime then starts, stops, or leaves the component alone accordingly. 
Dependency identity matters, not only value equality. If one provider is replaced by another provider exposing an equivalent value, dependents may still need to reload because the provider and its lifecycle have changed.

## 3. The unified context

Effects and coeffects operate through one first-class **context**.

The context acts as:

- the service/dependency environment
- the shared-state mediation layer
- the owner of effect tracking
- the place where scoped or isolated service resolution occurs
- the boundary through which component interactions become attributable

Loading a component executes effects against a derived context. Unloading it applies the accumulated inverses. Nested contexts allow parent components to own child components and all registrations made beneath them.

A useful informal name for this is:

> a dependency context with receipts

## 4. Components and fibers

A component has three logical parts:

```text
requirements
provisions
effect program
```

More concretely:

- **Requirements:** services or keys the component consumes.
- **Provisions:** services or keys the component may install.
- **Effects:** the operations performed while active, together with their inverses.

A live instantiation of a component is called a **fiber**. A fiber records information such as:

- component identity
- parent fiber
- current lifecycle state
- committed dependency resolution
- services it currently provides
- accumulated disposer
- failure or retirement state

A practical lifecycle is:

```text
Inactive
   -> Reloading
   -> Active
   -> Unloading
   -> Inactive
```

`Reloading` and `Unloading` exist because real activation and teardown may be asynchronous, incremental, cancellable, or fallible.

## 5. Safe provider withdrawal

Provider teardown is deliberately split into two moments:

1. The provider stops advertising itself as available.
2. The provider waits for existing dependents to deactivate.
3. The provider finally runs its own accumulated inverses.

This matters because a dependent's teardown may still need the provider it was using. For example, a consumer closing borrowed connections may need the connection pool to remain usable during cleanup.

The runtime therefore preserves each active component's **committed dependency view** through its teardown. The provider becomes unavailable to new work, but existing dependents retain access until their own unloading finishes. Only then is the provider's underlying state withdrawn.

This produces dependency ordering similar to:

```text
provider activates
    -> consumer activates
    -> provider announces withdrawal
    -> consumer unloads using provider
    -> provider unloads
```

## 6. Independent and order-sensitive effects

Removing one component from an interleaved runtime is safe only when its effects can be separated from the effects of other components.

The paper models this through **independence** and commutation:

```text
A then B  ≈  B then A
```

Typical independent operations include registering different keys in a map or adding unrelated entries to a set-like registry.

Order-sensitive operations include:

- ordered middleware chains
- transformations where later behavior depends on earlier output
- mutations of one shared sequential resource
- operations whose returned inverse changes depending on foreign state

The design rule is:

- Put commuting contributions behind independently retractable effects.
- Keep order-sensitive operations inside one component's LIFO disposer, or represent their ordering through explicit dependencies.
- Do not assume arbitrary event handlers or middleware are independent merely because they are implemented as separate plugins.

## 7. Observational equivalence

“Recovered” does not mean that every byte of process state is restored exactly.

Examples:

- freeing memory does not restore the allocator's previous internal layout
- generating and discarding an ID does not rewind the ID generator
- reopening a resource may produce a different operating-system handle

Instead, states are considered equivalent when no operation exposed through the relevant interface can distinguish them.

This is **observational equivalence**:

```text
different internal representation
+ identical externally observable behavior
= equivalent recovered state
```



## 8. Iteration, asynchrony, and failure

A component may activate through several incremental steps. Each completed step adds its inverse to the current accumulator.

At an iteration boundary, the runtime may discover that the component's dependency target has changed. It can then stop activation and retract only the effects completed so far.

For asynchronous work already in flight, the operation may be unable to stop instantly. The in-flight step is allowed to land, its inverse is recorded, and the component immediately transitions into unloading.

If activation fails, the component also transitions through unloading so that all successfully installed earlier effects are recovered before the failure is recorded.

The intended invariant is:

```text
partial activation never leaves partial ownership stranded
```

## 9. System-level guarantees

Under the paper's assumptions, the model establishes several useful properties:

- **Recovery exactness:** unloading one component removes its contribution while preserving independent work performed by other components.
- **Dependency ordering:** consumers activate after providers and finish unloading before providers complete withdrawal.
- **Progress:** with an acyclic dependency graph and finite activation structure, lifecycle reconciliation eventually reaches a quiescent state rather than deadlocking.
- **Confluence:** once the system settles, its state corresponds to the state that would have resulted from assembling the final surviving configuration from scratch, regardless of the intermediate reload history.

These guarantees are conditional, not magical. They depend on components respecting the composition discipline.

## 10. Important limits

### The runtime trusts inverses

The implementation can record and compose the disposer a component supplies, but it cannot generally prove that the disposer genuinely reverses the operation.

Correct atomic inverses remain an obligation on the effect author.

### Only mediated effects are tracked

An operation must pass through the composition context or another controlled interface to become lifecycle-owned.

Hidden global mutation, ambient singleton access, detached timers, and unregistered background work remain outside the guarantee.

### External emissions are not normally reversible

There is a difference between:

```text
acquire connection -> close connection
```

and:

```text
send message -> unsend message
```

Acquisitions can often be structurally reversed. Emissions that cross the system boundary generally require either:

- withholding until commit
- a domain-specific compensating action
- acceptance that they are irreversible



### Composition is not sandboxing

Dependency declarations can support capability-style access control, but untrusted code running in the same unrestricted language runtime can bypass those conventions. True isolation requires a process, runtime, WebAssembly boundary, container, or other sandbox.

## 11. Implementation checklist

A system following this paradigm should aim for these rules:

1. Every shared-state mutation goes through an owned context operation.
2. Every atomic registration or acquisition returns an idempotent disposer.
3. Composite teardown is derived by composing atomic disposers in reverse order.
4. Components declare dependencies rather than discovering them through ambient lookup.
5. Provider identity is recorded when a component activates.
6. A provider stops satisfying new consumers before destroying resources.
7. Provider destruction waits for existing dependents to finish unloading.
8. Async activation records cleanup incrementally.
9. Activation failure routes through ordinary teardown.
10. Multiple providers are represented explicitly through isolation, brokering, or a registry.
11. Order-sensitive interactions are not disguised as independent effects.
12. External emissions are treated separately from reversible acquisitions.
13. Component, dependency, event, and ownership topology is made inspectable.
14. Lifecycle tests include replacement, partial activation, failure, dependency withdrawal, and repeated disposal.

## Working mental model

```text
Component
  requires: [services it needs]
  provides: [services it may install]

  activate(context):
    perform effect
      -> record inverse

    perform effect
      -> record inverse

  deactivate():
    dependents drain
    inverses run in reverse order
```

The paper's central claim is not that arbitrary programs can be automatically reversed. It is that a runtime can provide strong dynamic-composition guarantees when component interactions are expressed through declared dependencies and locally paired effect/inverse operations.