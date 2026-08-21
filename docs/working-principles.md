# Working principles

This laboratory is for finding out whether a useful Crew-and-DSH product can be built, not for preserving a particular integration plan.

## Work with the living harness

Treat the current DeepSeek Harness (DSH) checkout and its documented public composition surface as the reference. Build plugins and profiles beside DSH; do not maintain a private fork, import package internals, or turn a DSH commit into a pin, freeze, update gate, or compatibility contract. When upstream movement affects a slice, adapt the slice forward.

Upstream architecture, Cordis composition, publishing, and Agent Teams facts belong in DSH's living documentation. This repository records only the Crew-specific decision or experiment that depends on them.

## Prove a product slice

Start with the thinnest complete vertical behavior that could matter to a user: a real agent, a real Crew capability, a visible result, and its durable outcome. Finish the wiring before widening the feature set. A useful negative result is one that clearly shows which boundary or extension point failed the slice.

Use narrow checks that exercise the behavior changed by that slice. Do not make exhaustive matrices, repeated smoke runs, formal proofing, preemptive hardening, or process ceremony the default. Complete wired behavior and honest limitations are still mandatory.

## Keep ownership legible

Compose DSH through public plugins, services, events, slots, bundles, and profiles. Crew keeps the durable organizational and governance meanings that the experiment needs; DSH should absorb generic harness machinery only where the working slice demonstrates that it can.

Current experimental Agent Teams already supplies roster, mailbox, and task coordination. Compose or extend it before Crew recreates those generic concerns. A separate Crew authority is warranted only when the slice demonstrates a Crew-specific meaning that the DSH seam cannot carry.

Crew's exact-SHA review and CI identity remains Crew evidence. It is not a DSH dependency policy.

## State operational limits plainly

An experiment may accept a trusted-LAN boundary when it states that boundary and its limitations. Do not add authentication, certificate, compliance, or other security ceremony unless the slice calls for it. Record what is actually connected, what remains external or future (including any memory capability), and what has not been demonstrated.

## Current upstream references

- [DSH architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- [Cordis primer](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md)
- [Package and install a plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
- [Experimental Agent Teams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/agent-team.md)
