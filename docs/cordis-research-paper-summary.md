# Spatiotemporal Composability: Practical Summary for Implementers

## Status and applicability

This is conceptual background for reasoning about component ownership and lifecycle.

It is not a DSH requirement, a demand for formal proof or exhaustive lifecycle testing, or a reason to add hardening or security ceremony or copy paper machinery into every plugin.

Use the ideas proportionately with the local [working principles](working-principles.md) and the current upstream [Cordis primer](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md).

The current DSH source and documentation remain authoritative for a plugin's actual API and obligations.

## Core idea

The paper describes a runtime in which components can be loaded, unloaded, replaced, and reconfigured while a process remains alive.

Its useful practical distinction is between what a component **needs**, what it **provides**, and the effects it performs while active.

Temporal composability concerns undoing one component's contribution when it leaves.

Spatial composability concerns the declared dependencies and provisions through which components meet.

## Effects and coeffects

An **effect** is a component-owned change to shared state, such as registering a tool, listener, route, or child component.

The effect returns a disposer for that particular change.

As effects accumulate, their disposers can undo the component's work in reverse order when it unloads.

A **coeffect** is a dependency a component requires.

A runtime can activate a component when its requirements are available, deactivate it when they are not, and reconsider it when the identity of a provider changes.

Dependency identity matters: an equivalent replacement can still have different lifecycle implications.

The context is consequently a dependency environment and an ownership boundary for the effects mediated through it.

## Fibers and provider withdrawal

A live component instance, or **fiber**, records the component's lifecycle, dependency view, provided services, and accumulated cleanup.

Nested contexts let a parent own the children and registrations created beneath it.

When a provider leaves, consumers may need that provider to finish their own cleanup.

The paper therefore separates withdrawing a provider from destroying its resources:

1. New consumers stop resolving the provider.
2. Existing dependents drain while retaining their committed dependency view.
3. The provider's effects are released.

This is an ownership and ordering idea, not a promise that every arbitrary operation can be reversed.

## Limits

The runtime can track only changes made through its context or another controlled boundary.

It cannot prove that a supplied disposer is correct, retract hidden global mutations, or undo external emissions such as a sent message.

Order-sensitive work, detached background activity, and irreversible domain actions need explicit local ownership decisions.

The composition model is not a security boundary or a substitute for process isolation.

## Practical local implications

For DSH/Cordis work, the paper is a useful prompt to ask:

- Which plugin owns this registration, resource, or background activity?
- Which current service and lifecycle boundary should mediate it?
- Does cleanup need an explicit disposer, and does teardown ordering matter?
- Is this an internal acquisition that can be released, or an external emission that needs domain-specific handling?

Those questions complement, rather than replace, the current [Cordis primer](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md) and DSH subsystem documentation.
