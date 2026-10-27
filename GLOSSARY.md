# Imobia

An AI Assistant answers a real-estate broker's WhatsApp messages, and a kanban shows where each negotiation stands. Terms are in English; the Portuguese word the broker sees in the app follows in quotes.

## Language

**Broker** ("Corretor"):
A real-estate professional who signs up for Imobia and works alone. Every other record belongs to exactly one Broker, and no Broker sees another's.
_Avoid_: User, agent, realtor

**Contact** ("Contato"):
A person who talks to a Broker over WhatsApp about buying a Property. Someone who only asked a question and never bought is still a Contact. A new WhatsApp number makes a new Contact. When one person writes from two numbers, the Broker merges the two Contacts: the Broker picks which one survives, and it keeps both numbers and all the Deals.
_Avoid_: Client, lead, customer

**Development** ("Empreendimento"):
A developer's project that the Broker sells units of: a subdivision of Lots ("loteamento") or a launch of Off-plan Houses. It holds what all its Properties share, such as location, amenities and payment terms.
_Avoid_: Project, launch, subdivision, condominium

**Property** ("Imóvel"):
A single unit a Broker sells inside a Development: either a Lot or an Off-plan House. A Broker's Properties together make up their Portfolio.
_Avoid_: Listing, unit, real estate

**Lot** ("Terreno"):
A Property that is a piece of land.
_Avoid_: Plot, land, terreno (in code)

**Off-plan House** ("Casa na planta"):
A Property that is a house sold before it is built or finished.
_Avoid_: Pre-construction, new build, launch

**Portfolio** ("Carteira"):
All the Properties a Broker has to offer. The Assistant answers and makes suggestions only from the Portfolio.
_Avoid_: Inventory, catalog, stock

## Conversations

**Assistant** ("Assistente"):
The AI that answers Contacts on the Broker's WhatsApp, on the Broker's behalf.
_Avoid_: Agent, bot, Imobia (the product)

**Business Number** ("Número do corretor"):
The Broker's own WhatsApp number, connected to Imobia, that Contacts write to. A Broker has one.
_Avoid_: Line, channel, phone number (ambiguous with a Contact's)

**Conversation** ("Conversa"):
The WhatsApp chat between a Broker and one of a Contact's numbers. A Contact has one Conversation per number, however many Deals they have.
_Avoid_: Chat, thread, ticket

**Takeover** ("Atendimento pelo corretor"):
The period when the Broker answers a Conversation personally and the Assistant stays silent in it. It starts when the Contact asks for a human or the Assistant can't answer, and ends when the Broker hands the Conversation back.
_Avoid_: Handoff, escalation, human mode

## Deals

**Deal** ("Negociação"):
One Contact's negotiation to buy at most one Property from a Broker. A Contact interested in three Properties has three Deals. A Deal is open until it is Won or Lost.

A Contact has at most one open Deal per Property, and at most one open Deal with no Property yet. Picking a Property fills in that Deal; each further Property starts a new Deal at Qualifying with the same Search Criteria. When merging two Contacts leaves two open Deals on the same Property, the Broker keeps one and the other is Lost.
_Avoid_: Card, opportunity, lead, sale

**Search Criteria** ("O que procura"):
What the buyer in a Deal is looking for, such as Property type, budget and region. Mostly useful while the Deal has no Property yet.
_Avoid_: Preferences, profile, filters

**Stage** ("Etapa"):
One step a Deal goes through on its way to being Won or Lost. Each Deal is in exactly one Stage at a time.
_Avoid_: Column, status, phase, pipeline step

The Stages, in order: New ("Novo"), Qualifying ("Qualificação"), Visit ("Visita"), Proposal ("Proposta"), Financing ("Financiamento"), Documents ("Documentação"), then one of two final Stages, Won or Lost. A Deal paid in cash skips Financing. The Assistant may move a Deal up to Visit; from Proposal on, only the Broker moves it. A Deal may lack a Property only in New, Qualifying or Lost.

**Visit** ("Visita"):
The Stage where the Contact wants to see the Property. The Assistant collects the days that suit the Contact; the Broker confirms the date.
_Avoid_: Appointment, tour, showing

**Won** ("Fechado"):
The final Stage of a Deal whose buyer has signed the purchase contract. What happens after (deed, construction, delivery) is outside Imobia.
_Avoid_: Closed, sold, converted

**Lost** ("Perdido"):
The final Stage of a Deal that ended without a signed contract. A Lost Deal records a Lost Reason.
_Avoid_: Cancelled, dead, archived

**Lost Reason** ("Motivo da perda"):
Why a Deal was Lost, picked from a fixed list (such as price, financing denied, bought elsewhere, stopped replying, Property sold, duplicate, other), with an optional note.
_Avoid_: Loss note, cancellation reason

## Availability

**Available** ("Disponível"):
A Property that can still be offered to Contacts.

**Reserved** ("Reservado"):
A Property with at least one Deal in Proposal or later. Several Deals may compete for it. The Assistant stops offering it; it becomes Available again once all those Deals are Lost.
_Avoid_: On hold, blocked

**Sold** ("Vendido"):
A Property whose Deal is Won. Other open Deals on it are flagged for the Broker to resolve.
_Avoid_: Closed, unavailable
