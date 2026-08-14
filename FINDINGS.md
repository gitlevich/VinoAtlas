# VinoAtlas: first extraction pass

Run 2026-08-11 over 1,049,074 English reviews (of 1,179,789 total) from three
discourse families: critics (WineEnthusiast, 252k), community (Vivino via
WineSensed, 819k), retail catalogs (109k).

Pipeline: `scripts/extract_terms.py` then `scripts/build_lexicon.py`.

## What came out

| Product | File | Size |
|---|---|---|
| Candidate terms | `data/lexicon/terms.parquet` | 100,269 |
| Modifier→head frames | `frames.parquet` | 354,853 |
| Per-review slot records | `slot_records.parquet` | 2,739,250 |
| Coordination pairs | `coordinations.parquet` | 215,594 |
| Aroma referents | `aromas.parquet` | 61,841 |
| Modelled vocabulary | `vocab_classified.parquet` | 6,187 |
| Named contrasts | `axes.parquet` | 141 |
| Hierarchy | `taxonomy.json` | 995 terms, 674 nodes |

## Named contrasts

The method: a head noun that attracts many modifiers is a distinction the
discourse already named; the modifiers filling its slot are its value space.
Opposition is measured *inside the slot* — two words are opposed when they
rarely describe the same tannins, not when they rarely appear in the same
review. Coordination adds a second signal ("soft yet firm" = contrast, "soft
and silky" = list).

Strongest, with agreement between critic and community subcorpora:

| Distinction | Poles | Critic | Community |
|---|---|---|---|
| cherry | black ↔ red | 0.95 | 0.60 |
| color | red ↔ yellow | 0.84 | 0.83 |
| plum | black ↔ green | 1.00 | 0.79 |
| nose | intense ↔ floral | 0.77 | 0.86 |
| body | light ↔ medium | — | 0.96 |
| fruit | red ↔ tropical | 0.86 | 0.79 |
| acidity | high ↔ medium | 0.71 | 0.75 |
| texture | creamy ↔ dense | 0.73 | 0.73 |
| pepper | black ↔ white | — | — |

`texture` recovered a real contrast: *smooth, soft, lush, silky, unctuous*
against *steely, nervy, tangy, bright, zesty, chalky*. `tannin: firm ↔ soft`
came out weak (agreement 0.62 both sides, "rough" and "stiff" landed on the
soft pole) — the single most canonical wine axis is among the less cleanly
recovered ones.

**A methodological finding worth keeping.** The first attempt measured
opposition by review-level co-occurrence and produced garbage: `tannin` split
into *delicate, perfect, beautiful* versus *grabby, scratchy, gritty* — that is
pleasant-versus-unpleasant, not soft-versus-firm. Two causes, both instructive:
evaluation is the loudest dimension in tasting notes and swamps everything
unless removed, and review-level co-occurrence mostly measures register (florid
critic prose versus casual notes) rather than semantics. Both fixes were
necessary.

## Perceptual validation

WineSensed ran napping sessions: 256 untrained drinkers tasted wines **blind**
(non-transparent glasses, labels covered — verified against the paper) and
placed stickers by taste similarity. 81 of those wines also carry ≥30 reviews,
giving a direct test: do the wines a term is used about sit near each other in
the space tasters actually produced?

**The headline result is negative.** Of 1,666 terms tested, 64 reached p<0.05
where ~83 are expected by chance. As a body, the descriptor vocabulary does
*not* predict how tasters grouped wines. Vlad's prior that most expert terms
may not be phenomenologically meaningful survives its first contact with data.

Individual terms do stand out well beyond chance: `tannic` (effect −4.80,
p<0.001, 60 wines), `body` (−3.19), `prune` (−2.94), `flat` (−2.74), `deep`
(−2.61), `sour` (−2.22).

The ordering by class is the more interesting signal:

| Class | Mean effect (negative = coheres with tasting) |
|---|---|
| sight | −0.36 |
| chemesthetic | −0.16 |
| aroma | −0.11 |
| touch | −0.06 |
| taste | −0.06 |
| **evaluation** | **+0.12** |

Evaluative vocabulary is the *least* perceptually coherent class — praise does
not track how tasters grouped wines. That is the expected direction and a
useful check on the classifier. Sight terms being most coherent cannot be a
visual confound, since tasters could not see the wine; colour words presumably
track wine type, which tracks taste.

Caveats: 81 wines, only 18% of wine pairs directly observed, mostly reds.

## The prediction, tested afterwards

Vlad predicted (a) distinctions are lexically scoped — a contrast means
something different inside different parent contexts — and (b) discovery runs
sight → smell → taste. Both were recorded before testing and kept out of how
the lexicon and hierarchy were built.

**(b) Discovery order: supported.** First-mention position within a note,
0 = start, 1 = end:

| Class | Community | Critics |
|---|---|---|
| sight | 0.341 | 0.379 |
| aroma | 0.429 | 0.442 |
| touch | 0.451 | 0.488 |
| taste | 0.506 | 0.559 |
| discourse | 0.556 | 0.632 |

Order is sight → smell → touch → taste, with touch inserted between smell and
taste. Critics prove nothing here: WSET trains appearance→nose→palate. The
community corpus follows no template and shows the same order more strongly,
which is what makes it interesting. Residual caveat: community writers may be
imitating a convention they have read.

**(a) Lexical scoping: suggestive, not established.** Comparing each head's
companion vocabulary between red and white subcorpora — after dividing out each
subcorpus's background, without which the test measures nothing but "red
reviews say black and plum":

- Most re-scoped: `tannin` (0.17), `peach` (0.16), `currant` (0.15), `tomato` (0.20)
- Least re-scoped: `finish` (0.83), `note` (0.79), `palate` (0.76), `flavor` (0.76)

The pattern is coherent: abstract structural containers mean the same thing
everywhere, while concrete content distinctions are context-bound. `tannin`
recruits *assertive, bracing, chalky, integrated* among reds but *grip, extract,
dark* among whites. Confounded, though — a term rare in one context appears in
unusual company for that reason alone.

**Scope breadth did not support the prediction.** Sensory classes have nearly
identical breadth across wine colours (sight 0.774, taste 0.765, touch 0.761,
aroma 0.735); abstract classes are broadest (structure 0.870, evaluation 0.853).
Sight is not the universally-applicable sense the prediction implies.

The scope measure itself works: narrowest-scope terms are *prosecco, cava,
barolo, port, brut, bubbly, sparkler* — all genuinely bound to one wine type.

## Second data pass: perceptual ground truth from independent studies

Text was never the bottleneck; perceptual ground truth was. Four more studies
were added and converted to a single method-independent schema — "which wines
did people perceive as alike", expressed as scaled pairwise distances
(`data/corpus/perceptual_distances.parquet`, `scripts/vino/ground_truth.py`).

| Study | Method | Samples | Judges |
|---|---|---|---|
| WineSensed | napping, blind taste | 111 | 568 sessions |
| Loire napping (SensoMineR) | napping | 10 | 11 |
| sortingWines (DistatisR) | free sorting, blind smell under red light | 18 | 19 experts + 26 novices |
| Bourgogne/Cabernet Franc QDA (Zenodo 1213610) | descriptive analysis | 19 | 16 panelists × 33 descriptors |
| Loire QDA (FactoMineR) | descriptive analysis | 21 | panel means, 29 descriptors |

### Experts versus novices: agreement is entirely wine type

`sortingWines` (Ballester et al. 2009) sorted the same 18 wines — 6 red, 6
rosé, 6 white — with two separate panels, smelled blind under red light so
colour could not be seen.

| Pairs | Expert–novice | Expert–expert (two tasks) |
|---|---|---|
| All (153) | **0.632** | 0.640 |
| Across wine type (108) | 0.646 | 0.707 |
| **Within wine type (45)** | **−0.116** (p=0.45) | **−0.200** |

The naive reading of the top row — "novices carve the space about as well as
experts carve it themselves" — does not survive. All of that agreement is
recognising red from rosé from white. Below the type boundary the correlation
vanishes.

The control row is what makes this interpretable. Within a type, experts do not
agree with *themselves* across two sorting tasks either. So this is not
"novices lack a discrimination experts have." At this scale, **nobody shows
reliable consensus below the coarsest distinction** — either finer structure is
not reliably perceived in an orthonasal sorting task, or 45 pairs cannot detect
it.

This agrees with the WineSensed result from an unrelated method and population:
sight-classed terms were the most perceptually coherent, and the vocabulary as a
whole showed no enrichment over chance. Two independent lines, one story: **the
coarse level is real and shared; the fine level is not yet demonstrably shared
by anyone.**

That is a sharpening rather than a discouragement. It suggests the universal
part of the domain model is thin, and that below wine type the right frame may
be personal rather than consensual — which is the taste-discovery half of the
project, not the domain-model half. It also sets the bar for the paired-tasting
mechanic: the distinctions worth testing are exactly the ones where group
consensus fails, and where an individual's own repeatability is the only
meaningful criterion.

### Does "reads alike" predict "tastes alike"?

The per-term test asks the wrong question — a taste is a combination of
descriptors, not one word. The right test is representational: compute wine-to-
wine similarity in descriptor space, compute it in the blind-tasting space, and
ask whether the two agree (Mantel, 5000 permutations, permuting the *text*
matrix so the missing-pair mask stays fixed).

73 wines, 531 observed pairs. **All of them red**, so this is already a
within-context test — the coarse distinction is not available to inflate it.

| Vocabulary used | Terms | rho | p |
|---|---|---|---|
| touch / mouthfeel | 562 | **+0.098** | 0.048 |
| taste | 220 | **+0.089** | 0.049 |
| percepts only | 1828 | +0.054 | 0.18 |
| aroma | 707 | +0.038 | 0.25 |
| structure | 1414 | +0.022 | 0.36 |
| all vocabulary | 6187 | +0.019 | 0.37 |
| commerce + discourse | 1072 | +0.005 | 0.46 |
| evaluation | 632 | −0.002 | 0.51 |

Two readings, both worth keeping.

**Weak in absolute terms.** rho ≈ 0.1 is a faint signal, and at eight tests
neither marginal p survives correction. Nothing here licenses a claim that
tasting notes predict taste.

**But the ordering is exactly what the theory predicts, and scoping multiplies
the signal fivefold**: all vocabulary (0.019) → percepts only (0.054) → touch
alone (0.098). Evaluative vocabulary predicts precisely nothing (−0.002), and
commerce/discourse nothing (0.005). The classifier is crude, yet filtering by it
monotonically improves prediction — which is evidence that the class structure
is real even where the absolute signal is small.

That is the refinement mechanism, visible in data: **narrowing the vocabulary to
the right scope multiplies what it predicts.** The limit right now is perceptual
data density (531 of 2628 pairs observed), not method.

## Hierarchy

995 grounded perceptual terms, 674 nodes, mean branching 2.2, max 4 — the
narrow-branching constraint holds at every level. Depth reaches 18, which is
the price of narrow splits and is probably too deep to walk.

Top levels, built without being told anything about wine:

```
fruit
├── spice                    (structural / pungent / savory)
│   ├── acidity → pungent → hard | unpleasant
│   │           → tangy   → mouthfeel | dry
│   └── aromas  → nose    → warm | hint
│               → pepper  → spiced | tobacco
└── cherry                   (fruit / aromatic)
    ├── apple   → flower  → honey | floral
    │           → citrus  → lemon | peach
    └── vanilla → herb    → licorice | cinnamon
                → plum    → cherry flavor | blackberry
```

The fruit branch splits into citrus/floral versus plum/blackberry — the
white-versus-red aromatic division, emergent rather than imposed. Node names
are chosen as the most central general member, with parent names disallowed for
children.

## Known weaknesses

1. **The classifier is unreliable.** `tannic` → sight, `port` → aroma, `brut` →
   taste, `bubbly` → touch. Seed-based propagation over embeddings is too crude,
   which weakens every class-level number above, including the modality
   orderings. This is the first thing to fix.
2. **Node naming is thin.** Names are picked from existing vocabulary; where the
   discourse has no word for a group, the node borrows a member's name instead
   of being flagged as an unnamed distinction. Those gaps are the interesting
   ones.
3. **Community corpus lacks metadata.** WineSensed has grape/variety for only
   5% of reviews, so red/white comparisons lean on critic and catalog text.
4. **Multilingual reviews are unused.** 130k non-English reviews were dropped;
   the French Vivino keyword taxonomy is an unexploited cross-language bridge.
5. **Depth 18** needs collapsing before this is walkable as a zoom interface.

## Licensing

- **WineSensed** is CC BY-NC-ND 4.0 — non-commercial, *no derivatives*. Fine for
  research and validation; a product built on it needs a different footing. It
  supplies the community corpus and the napping ground truth.
- **X-Wines** requires citing the paper (MDPI 2504-2289/7/1/20).
- CellarTracker remains available from mirrors if the community corpus needs
  broadening.

## Dimensionality, measured properly

Every earlier count of "how many dimensions a domain has" was wrong, in two
independent ways. Both are fixed here; the numbers they produced are withdrawn.

**Fault one: the instrument was wine's.** All domains were scored on the 587
percept terms harvested from the wine corpus, which has no slot for diesel,
skunk, gas or kush. `scripts/extract_domains.py` now harvests each domain's
vocabulary from that domain's own text, by syntax rather than by seed list -- a
term qualifies by modifying a noun or by filling an aroma frame, tests that
consult no list of expected words. Union lexicon: **2,246 terms** across six
domains, against wine's 587. Own-vocabulary sizes: tea 1,601, wine 1,264,
cannabis 843, coffee 373, chocolate 59, cheese 51.

**Fault two: the reproducibility test was uncalibrated.** Split-half SVD with
element-wise axis comparison is too strict, because close singular values let
axes swap between halves and a real pair reads as two failures. Comparing whole
subspaces instead is far too lax: two subspaces of any useful width overlap by
geometry alone, and on column-shuffled data that version reported 17
reproducible dimensions at agreement 0.92. The estimator now pairs the two
halves' axes one-to-one by maximum-similarity assignment, which is order-free
but cannot inflate. On the same shuffled null it reports **0**, best spurious
match 0.28.

### What the corrected measurement says

Reproducible dimensions, median over 21 splits, 10th-90th percentile in
brackets, at each corpus's full size:

| domain | documents | descriptors/doc | dimensions |
|---|---|---|---|
| tea | 120,241 | 7.2 | 9 [7, 11] |
| wine | 130,706 | 4.8 | 8 [6, 10] |
| cannabis | 122,640 | 3.5 | 7 [5, 8] |
| coffee | 5,122 | 14.0 | 6 [4, 7] |

Robust to the rarity floor: sweeping the term-inclusion threshold across a
twenty-fold range (0.1% to 2% of documents) moves every count by at most two.

The three large domains are statistically indistinguishable. Coffee reaches
almost the same figure from a fortieth of the documents, which looks like a
finding about expert protocols until the documents are counted properly.
Co-occurrence information scales with descriptor *pairs* per document, not
documents, and coffee's assessors report fourteen descriptors where a wine
drinker reports five. Against pair count, all four domains collapse onto one
line:

    dimensions = -14.8 + 3.55 * log10(pairs)      R2 = 0.81

Mean residuals: wine +0.74, cannabis +0.57, coffee -0.37, tea -1.17. Coffee is
*below* the line -- its advantage was entirely the density of its documents, not
the training of its writers. **Domain identity is worth about one dimension.
Everything else is how much co-occurrence the corpus happens to carry.**

### No domain has saturated, and text cannot get there

Not one curve plateaus anywhere in the observed range, up to 2.9M pairs. Every
tenfold increase in co-occurrence information buys 3.5 more dimensions, with no
sign of the increment shrinking. Extrapolating the fit, thirty dimensions would
need around 10^12.6 pairs -- roughly a million times the data that exists.

So the earlier ceilings were measurements of corpus size. Wine's 18 dimensions,
tea's 21, the ~120-percept ceiling, and the conclusion that the vocabulary had
saturated while the world had not: all withdrawn. Nothing had saturated. The
corpora had simply run out.

### The contrast that shows what is missing

The same estimator, on the same substance, through a different instrument.
Cannabis terpene concentrations (MaxValue, 9 terpenes above 50% reporting,
32,661 complete samples), log1p-transformed:

| samples | dimensions |
|---|---|
| 500 | 3 |
| 1,000 | 6 |
| 2,500 | 7 |
| 5,000 | 8 |
| 32,661 | 8 |

It saturates at 5,000 samples and stays flat -- 8 of the 8 available, the full
rank of the panel. Cannabis *text* needs 122,640 documents to reach 7 and is
still climbing.

This is the load-bearing comparison, and it also validates the estimator: the
measure can detect a ceiling when a ceiling exists, so text's failure to plateau
is a property of text and not a defect of the method.

The difference is completeness, not volume. A lab panel measures every channel
on every sample; absence is a measured zero. A review mentions three to fourteen
descriptors out of hundreds available, and absence means nothing at all -- not
absent, merely unremarked. Text co-occurrence has to reconstruct the joint
distribution from data that is missing not at random, which is why it grinds
along a log line instead of converging.

**Consequence for the resolution question.** "How many percepts can a human
distinguish among liquids one sees, smells and tastes" is not answerable from
review text at any corpus size obtainable. It is answerable from any protocol
producing a complete vector per sample: chemical panels, sorting and napping
tasks, fixed-field sensory scoring. That is where the next data should come
from, and it is the reverse of the assumption this project ran on -- the
constraint was never how many reviews there are.

## The cannabis sigil

Cannabis is the one domain here where a claimed distinction can be checked
instead of asserted: 563 strains carry both a lab terpene panel and Leafly's
fixed-vocabulary flavour scores. Scripts: `cannabis_join.py`,
`cannabis_grounding.py`, `cannabis_sigil.py`.

**Review prose is the wrong text side.** Per-strain descriptor rates from
142,828 Leafly reviews ground poorly in chemistry -- 11% of 487 descriptors
above the permutation null, topped by `colored`, `strain` and `recommend`.
That is the effects finding restating itself: the prose is about how a strain
feels. Leafly's 43 flavour scores are the right instrument, being a fixed
vocabulary applied to every strain, so an absent flavour is a measured zero
rather than an unremarked one. Against those, **28 of 43 flavours are grounded**
above the null, up to rho=0.25.

**Not name leakage.** The strongest grounded flavours are also strain names --
blueberry, grape, blue cheese, diesel, vanilla -- which looks fatal until it is
tested. Dropping strains whose name contains the flavour word makes the
correlations *stronger* on average, 0.101 to 0.114 (strawberry 0.14 to 0.26).
The grounding is real.

**The folk chemistry is wrong.** Univariate correlations against the tag:

| claim | measured |
|---|---|
| pinene -> pine | **+0.00** |
| limonene -> citrus | +0.09, beaten by terpinolene at +0.15 |
| limonene -> lemon | +0.09, beaten by terpinolene at +0.19 |
| anything -> skunk | max +0.11, a volatile-sulfur phenomenon the panel cannot see |

The terpinolene-citrus bearing replicates the Oregon State curated panel
(+0.58, n=91) and contradicts the industry's limonene story. More importantly,
blueberry reaches rho=0.25 multivariately while no single terpene passes 0.10:
**the grounded percepts are directions in terpene space, not compounds.**
Naming a strain after its dominant molecule describes the wrong object.

**The chemistry is genuinely clustered.** Silhouette against a
covariance-matched Gaussian null runs 19 to 42 standard deviations high across
k=2..8. Chemovars are discrete, not a continuum.

**The intended narrow branching was refused by the data.** Two children per
node is the design rule, and at k=2 only 3 flavour words separate the groups
against a null of 0.5. At k=4 it is 17 words, at k=5 it is 21, null 0.4 or
0.6. Cannabis's first distinction is four- or five-way. Branching is therefore
chosen per node by nameability, and the resulting structure is wide and
shallow rather than deep and narrow:

```
563 strains -- 5 branches, 21 words vs 2 by chance, 32% hold out of sample
  128  coffee, earthy, mint, pungent
  213  unnamed -- 3 branches, 10 words vs 2, 43% hold out of sample
         27  coffee, woody
         55  berry, blueberry, cheese, diesel, grape, lavender, mango, strawberry
        131  unnamed, no nameable division
   26  citrus, lemon, orange, pear, rose, strawberry
  105  blue cheese, blueberry, cheese, mango, menthol, pineapple, tropical
   91  butter, diesel, tar, vanilla
```

**Read it honestly: this is a thin sigil.** Maximum depth two. Only 32-43% of
the naming words survive refitting the grouping on held-out strains, so roughly
seven of the root's twenty-one names are dependable. And a 131-strain chemovar
group -- a quarter of everything measured -- carries no distinguishing
vocabulary at all.

That last one is the interesting cell. It is a sharply separated region of the
chemistry with nothing said about it, which is what the relevance argument
predicts: the boundary is in the material, nobody attends to it, so no word
grew there. The unnamed branch is where a vocabulary is missing, not where a
distinction is absent.

### The predictive side: chemistry against effect

Same 563 strains, same method, effect scores instead of flavour scores.

| predictor | mean rho over 13 effects |
|---|---|
| terpene composition | **0.133** |
| cannabinoids (THC, THC-A, CBD, CBG, CBN, CBC, THCV) | 0.036 |
| both together | 0.188 |
| terpene composition -> *flavour*, same strains | 0.071 |

All 13 of 13 effects clear the permutation null (0.057). Strongest: energetic
0.191, talkative 0.181, focused 0.174, uplifted 0.146.

**Terpene composition predicts how a strain acts roughly twice as well as it
predicts what it smells like.** And potency predicts almost nothing -- THC is
at 0.036 overall and *negative* for energetic and focused.

The obvious confound is reliability: if effect scores carry more votes than
flavour scores, they would be less noisy and easier to predict. They do not --
median votes per strain are 124 for both -- and restricting to better-attested
strains widens the gap rather than closing it:

| minimum votes | strains | effects | flavours |
|---|---|---|---|
| 0 | 563 | 0.137 | 0.074 |
| 25 | 468 | 0.156 | 0.039 |
| 100 | 324 | 0.170 | 0.019 |
| 250 | 196 | **0.206** | 0.044 |

Flavour prediction *falls* as flavour scores become better attested, which
suggests the residual flavour signal is partly consensus about reputation
rather than about the material. Effect prediction rises, as a real signal
should.

So the recoverable structure is more tightly coupled to what the material does
than to what it smells like -- which inverts the assumption that aroma is the
accessible channel and effect the mysterious one.

**Limit worth stating plainly.** These are population aggregates. They
establish that strain-to-effect structure exists and is chemically recoverable;
they cannot say how a given person responds. That question needs within-person
repeated measures -- the same person, many sessions, logged -- and no public
dataset of that kind exists here.

**Vocabulary gap, again.** Leafly's 13 effect labels are valence and arousal
terms: happy, relaxed, euphoric, sleepy, energetic. None names a change in the
*grain* of attention -- the temporal scale at which things become trackable.
The three best-predicted effects (energetic, talkative, focused) are the
closest the vocabulary comes, and all three are about tempo. This is the
unnamed chemovar branch appearing on the effect side: the structure is
recoverable, the words for it were never coined.

### Two vocabularies over one space, and a correction

Rebuilding the sigil with effect words instead of flavour words -- the stronger
channel -- gives a structure that is **more reliable but less differentiated**:
4 branches, 8 naming words, and **62% of them hold out of sample against
flavour's 32%**. Flavour names more regions and replicates half as often.

Decomposing the same 563 strains into 5 chemovars shows why, and shows what
each vocabulary is for:

| chemovar | n | chemical signature | flavour words | effect words |
|---|---|---|---|---|
| 0 | 26 | terpinolene +4.24 | citrus, lemon, orange, pear, rose, strawberry | creative, energetic, focused, talkative |
| 2 | 92 | limonene +1.74, b-pinene +1.61 | butter, diesel, tar, vanilla | relaxed, sleepy, tingly |
| 4 | 105 | linalool +1.68, caryophyllene oxide +1.41 | blue cheese, blueberry, cheese, mango, menthol, pineapple | -- |
| 1 | 121 | humulene +1.34, caryophyllene +0.81 | coffee, earthy, mint | -- |
| 3 | 219 | **nothing: largest z is 0.39** | -- | -- |

The effect vocabulary resolves exactly one axis -- terpinolene-up against
limonene-down, the sativa/indica contrast -- and resolves it reliably. The
flavour vocabulary reaches two further regions but holds up half as well.
Neither is the better instrument; they cover different ground.

**A quantitative law falls out.** Naming tracks distance from the centre of the
space, monotonically over all five groups:

| chemovar | mean distance from centre | named by |
|---|---|---|
| 0 | 5.13 | both vocabularies |
| 2 | 3.58 | both |
| 4 | 3.20 | flavour only |
| 1 | 2.69 | flavour only |
| 3 | 1.88 | neither |

Peripheral regions get names; central ones do not, and effect naming demands
more extremity than flavour naming does. This is the face idea arriving as a
measurement: a region has a face when it is far enough from the unmarked
centre, and the threshold differs by sense.

**Correction to the previous section.** The unnamed branch was read there as a
place where vocabulary is missing though the distinction exists. For the large
unnamed group that is wrong. Chemovar 3 is 39% of all strains and has *no
dominant terpene at all* -- its largest deviation is 0.39 standard deviations,
and it sits nearest the centre of the space. Language is not failing to name
it. There is nothing there to name; it is the unmarked case, and silence is the
correct description of it.

### Compression: 56 names, three distinctions

If a word's content is its bearing in terpene space, then two words with the
same bearing are one distinction under two names, and a word with no bearing is
a distinction without a difference. Both are measurable.

**17 of 56 words carry no bearing at all** and drop out: ammonia, apricot,
berry, chestnut, flowery, orange, pepper, **pine**, sage, **skunk**,
spicyHerbal, **sweet**, tea, tobacco, treeFruit, **woody**, and the effect word
**euphoric**. Several of these are the vocabulary's most-used terms.

Of the 39 that survive, the bearing matrix needs 6 of 9 possible axes to reach
90% of its variance, but the first two carry 64%. Clustering bearings by signed
cosine gives groups whose internal coherence is 0.63 to 0.74 against 0.43 for
random pairs. Clustering by |cosine| -- which collapses the two poles of a
single contrast onto each other -- gives the real answer:

| axis | n | words |
|---|---|---|
| 1 | **11** | **citrus, lemon, lime, honey, energetic, creative, focused, talkative, uplifted / relaxed, sleepy** |
| 2 | 24 | blueberry, cheese, coffee, diesel, vanilla, mint, mango, tar, rose, aroused, giggly, happy, tingly (loose: coherence 0.63) |
| 3 | 3 | earthy, pungent, hungry |
| 4 | 1 | tropical |

**The strongest axis is one bipolar contrast named eleven ways, and it spans
two sense modalities.** Citrus-smelling and energetic are not correlated
qualities; they are the same distinction. Strain-level checks: citrus/energetic
+0.374, citrus/sleepy **-0.408**, earthy/sleepy +0.357, pungent/relaxed +0.365,
earthy/energetic -0.284. Bearing alignment citrus-to-energetic is 0.63, both
terpinolene-dominant (+0.48 and +0.75) with humulene and pinene negative.

This is a named contrast in the original sense of this project -- discovered
from data, verified against chemistry, and crossing the boundary between what a
thing smells like and what it does. It also vindicates the synaesthesia
reading: people reach for a smell word to name an effect because there is one
sigil underneath, not two.

**Compression ratio is roughly 19:1** -- 56 names to 3 usable distinctions.

**Honest limit.** Replacing each word by its group mean retains only 37% of
strain-level variation. Most of what the vocabulary does is not about the
chemistry, which is consistent with grounding correlations of 0.1 to 0.25. The
claim is narrow and worth stating exactly: *of the content that is recoverable
from the material*, there are about three distinctions, and the vocabulary
spends 56 words on them.

### Desired effects, and whether strains can be recommended for them

**Separability first.** 55 of 78 effect pairs are separable by chemistry, but
every separable pair is an activating effect against `relaxed` or `sleepy`.
The inseparable ones are all activating-versus-activating: giggly/happy -0.013,
talkative/uplifted -0.052, focused/talkative -0.054, aroused/happy -0.055. So
the effect space the material resolves is **one axis**, and the apparent
thirteen desires are about two.

**Recommendation, validated out of fold** -- rank held-out strains by predicted
effect, then measure what the top of that ranking actually scores:

| desired effect | top-10 lift (SD) | top-30 lift |
|---|---|---|
| energetic | **+1.34** | +0.83 |
| uplifted | +1.27 | +0.35 |
| talkative | +1.06 | +0.46 |
| focused | +0.79 | +0.61 |
| creative | +0.77 | +0.57 |
| happy | +0.44 | +0.05 |
| aroused | +0.12 | +0.24 |
| relaxed | +0.01 | -0.02 |
| hungry | -0.01 | -0.04 |
| giggly | -0.08 | -0.04 |
| euphoric | -0.11 | +0.01 |
| **sleepy** | **-0.36** | -0.16 |

The activating pole is deliverable and the sedating pole is not -- asking for
sleepy returns strains that are *less* sleepy than average. And the working
requests are one request: top-30 overlap is 90% for energetic/focused and 83%
for talkative/uplifted, against 0% for energetic/sleepy.

**Why the asymmetry.** The activating pole is chemovar 0: terpinolene at
+4.24, the most peripheral group in the space, the only one named by both
vocabularies. Sedation is not a chemovar -- it is the absence of that marker,
spread across four heterogeneous groups including the featureless centre. This
is the naming law paying out in practice: **recommendation works exactly where
a region has a face, and the unmarked centre cannot be recommended toward.**
The market's most common advice, indica for sleep, is the one thing this data
will not support.

**What it costs at the counter.** All of the above ranks strains by their
median profile. A strain name pins only 18% of terpene variation, so buying by
name rather than by the batch's own certificate should attenuate the realised
lift by roughly sqrt(0.18) -- turning +1.34 SD into something nearer +0.5.
Recommendations are worth acting on read off a COA, and worth much less read
off a label.

## Wine bearings against time

The cannabis work only became falsifiable once each descriptor had a bearing in
a measured space. Wine has one already in the corpus: bottle age at the moment
of tasting, plus which grape it is. Neither was derived from anyone's
description. `scripts/wine_bearings.py`, over all 1,882,955 CellarTracker
reviews carrying age, date, wine and variety. Calendar year is held fixed,
since within one wine tasted repeatedly, age and date are the same variable.

**205 of 378 descriptors have no bearing at all.** Ranked from the bottom:
wrong, pronounced, lingering, fair, distinct, midpalate, pleasing, colored,
flat, super, true, similar, noticeable, mixed, impressed, subdued, rounded,
evident, prominent, awesome. Every one evaluative or vague. The dead weight
identifies itself without being told what to look for.

Of the 173 that do point somewhere, only **49 carry a real bearing on time**;
the rest are variety identity. Compression is weaker than in cannabis --
within-group cosine 0.51 to 0.55, with one group holding 126 terms -- because
24 of the 26 grounded dimensions are categorical grape, which swamps the
geometry. Age is the one continuous physical axis, and it is where the result
is.

### The maturation axis, recovered

| falls with age | rises with age |
|---|---|
| oak -0.019, vanilla -0.008, purple -0.007, fruity -0.007, crisp -0.006, cherry -0.006, blackberry -0.005, citrus -0.005, raspberry -0.004, strawberry -0.004, pear -0.004 | mature +0.024, old +0.021, long +0.017, leather +0.014, age +0.012, dried +0.011, tobacco +0.011, red +0.011, peak +0.009, earth +0.009, brown +0.009, orange +0.008 |

Three things worth noting, none of which the model was told.

**The colour sequence is exact.** purple -0.007, red +0.011, brown +0.009.
That is the known visual progression of a maturing red wine, recovered from
word counts against a date arithmetic, with no notion of colour anywhere in
the model.

**The aroma sequence is textbook.** Primary fruit falls, tertiary development
rises. Oak and vanilla fade fastest of anything measured.

**Evaluation rides along.** `lovely` +0.013 and `beautiful` +0.009 rise with
age as strongly as most descriptors. Either older bottles please people more,
or only the good ones survive to be drunk old; this design cannot separate
those.

This is the first wine result in the project validated against something that
is not more text, and it agrees with known oenology -- which is the point. The
instrument reproduces what is already established, so its verdict on the 205
dead words is worth taking seriously.

## Wine's dimensionality, measured on a complete instrument

> **SUPERSEDED 2026-08-12 (calibrated final form after WineAtlas cross-audit).**
> The figures below contain five successive instrument errors caught under
> cross-audit (evaluative fields included, repeats last-write-wins, an
> artificial width cap, a judge curve measuring wine stability rather than
> panel agreement, and an uncalibrated matching threshold whose null is not
> zero). The defensible result, per `scripts/qtl_dimensionality.py` and
> `data/lexicon/qtl_dimensionality.json`:
>
> - **median 8 matched axes at cosine 0.7 against a shuffled-null median of
>   2** -- maximum assignment matches by chance in dense regimes;
> - observed-minus-null median difference across thresholds 0.5-0.9:
>   2.0 / 4.5 / 6.0 / 5.0 / 3.0 -- a difference of 4.5-6 matched axes over
>   thresholds 0.6-0.8, not an identified count of real directions; no
>   threshold-free dimension count is claimed;
> - matched similarities decline continuously (.98 .95 .93 .88 .85 .78 .76
>   .72 .68 .64 .57) -- no clean elbow;
> - all 11 measured attributes reproduce across wine splits (median ceiling
>   at 400 wines, stable at 800); this bounds the instrument, not the wine;
> - two independent k-judge panels agree on 4/5/6/7/8 directions at
>   k=2/4/8/16/28 on shared partitions (k=28 reconciles exactly with the
>   headline). This sequence is OBSERVATIONALLY CONFOUNDED: small panels also
>   share fewer common wines (median 163 at k=2 vs 1,332 at k=16+), and wine
>   count independently controls axis recovery. Attributing the growth to
>   panel size needs a controlled (k x wine-count) surface with per-cell
>   nulls -- follow-up work, not claimed here.
>
> Point estimate walked 10 -> 8 -> 7 -> 8 -> "5-6 above chance" as the errors
> came off. Per-attribute reliability: `data/lexicon/panel_reliability.parquet`.

The parallel WineAtlas track (~/WineAtlas, built independently) assembled the
instruments this project concluded wine lacked: 1,063,217 normalized panel
observations across fourteen observational datasets (twenty-four dataset
entries include acquisition targets and term-evidence corpora). It also independently reproduced two negative
results -- 0 admitted parent relations from 1,231 concepts, and 3 of 66
distinctions admitted on its sensory-chemistry set.

Running the split-half matched-axis estimator on its largest panel,
wine_qtl_sensory_2026 (1,332 wines x 56 judges x 17 attributes):

| question | answer |
|---|---|
| do wine differences reproduce? (wine-split) | 16 of 17 dims, saturating at ~800 wines |
| how many judges does the instrument need? | 4 (flat from there to 56) |
| do two independent halves of humans see the same structure? (judge-split) | **10** [8, 13] |

Cross-checks: nz_pinot (116 wines) 6, loire_chenin (60 wines) 0,
sensory_chemistry (16 wines) 0 -- consensus dimensionality is gated by wine
count and only saturates where wines are plentiful.

**Reading.** The material supports ~16 reproducible dimensions on this
instrument; human consensus carries ~10 of them. The 6-dimension gap is
panel-specific calibration, not noise. So the answer to "how many distinctions
does wine actually have," on the best available complete instrument: **about
ten inter-subjective perceptual dimensions** -- against 8 recoverable from
1.9M reviews' text, 9 from cannabis terpenes, 8 from the same estimator's
terpene ceiling. Complete instruments saturate; text never does; and the
number wine converges to is one order of magnitude below its 3,738-term
vocabulary.
