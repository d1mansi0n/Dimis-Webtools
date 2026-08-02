import '../../styles/app.css';
import './recipes.css';

import { el, requireElement, type Child } from '../../core/dom.js';
import { formatNumber } from '../../core/format.js';
import { intlTag, locale, plural, t } from '../../i18n/index.js';
import { boot } from '../../shell/boot.js';
import { confirmDialog } from '../../shell/dialog.js';
import {
  CATEGORY_ORDER,
  MEAL_ORDER,
  RECIPES,
  STAPLES,
  type Category,
  type Recipe,
} from './data.js';
import {
  addCustomItem,
  clampPersons,
  clearTicks,
  countEntries,
  createRecipeStore,
  MAX_CUSTOM_ITEMS,
  MAX_CUSTOM_NAME,
  MAX_CUSTOM_NOTE,
  portionsFor,
  recipesOf,
  removeCustomItem,
  selectedRecipes,
  shoppingList,
  stapleCheckId,
  type CustomItem,
  type Quantity,
  type ShoppingEntry,
  type TickScope,
} from './recipes.js';

/** A card's "3/7" readout, refreshed in place as ticks change. */
interface Counter {
  readonly element: HTMLElement;
  readonly ids: readonly string[];
}

boot({
  start() {
    const store = createRecipeStore();
    const saved = store.read();

    let persons = clampPersons(saved.persons);
    const selected = new Set(saved.selected);
    const checked = new Set(saved.checked);
    let custom: readonly CustomItem[] = saved.custom;

    /* The aisle the last own item went into, offered as the default for the
       next one: a shop is walked aisle by aisle. */
    let lastCategory: Category = custom.at(-1)?.category ?? 'fruit';

    /* `<details>` elements are rebuilt whenever the person count changes, so
       which ones were open has to be remembered here rather than in the DOM. */
    const openRecipes = new Set<string>();

    let currentTab: 'recipes' | 'shopping' = 'recipes';

    /*
     * Which panels no longer match the state above.
     *
     * Only the panel actually on screen is rebuilt; the hidden one is marked and
     * brought up to date when it is next shown. Choosing a recipe used to rebuild
     * both panels — 25 cards, ~100 scaled amounts and the whole shopping list —
     * to flip one button's label, and the shopping list was rebuilt on every tap
     * even while nobody could see it.
     */
    const stale = { recipes: true, shopping: true };

    /** The "3 recipes chosen" badge, refreshed in place as recipes are toggled. */
    let selectionBadge: HTMLElement | undefined;

    /* Rebuilt by every shopping render; the tick handler updates them in place
       so that ticking a box never re-renders the list under the user's finger. */
    let counters: Counter[] = [];
    let allCheckIds: readonly string[] = [];
    let progressFill: HTMLElement | undefined;
    let progressLabel: HTMLElement | undefined;

    /* --------------------------------------------------------------- elements */
    const recipesPanel = requireElement('#recipes-panel-recipes');
    const shoppingPanel = requireElement('#recipes-panel-shopping');
    const recipesTab = requireElement<HTMLButtonElement>('#recipes-tab-recipes');
    const shoppingTab = requireElement<HTMLButtonElement>('#recipes-tab-shopping');
    const personsCount = requireElement('[data-recipes="personsCount"]');
    const minusButton = requireElement<HTMLButtonElement>('[data-recipes="personsMinus"]');
    const plusButton = requireElement<HTMLButtonElement>('[data-recipes="personsPlus"]');
    const feedback = requireElement('[data-recipes="feedback"]');

    /* ----------------------------------------------------------------- chrome */
    document.title = `${t('tool.recipes.name')} · ${t('app.name')}`;
    requireElement('[data-recipes="title"]').textContent = t('tool.recipes.name');
    requireElement('[data-recipes="lead"]').textContent = t('recipes.lead');
    requireElement('#recipes-persons-label').textContent = t('recipes.persons.label');
    minusButton.setAttribute('aria-label', t('recipes.persons.decrease'));
    plusButton.setAttribute('aria-label', t('recipes.persons.increase'));
    recipesTab.textContent = t('recipes.tab.recipes');
    shoppingTab.textContent = t('recipes.tab.shopping');

    /* ------------------------------------------------------------ persistence */
    function persist(): void {
      const result = store.write({
        persons,
        selected: [...selected],
        checked: [...checked],
        custom,
      });
      feedback.textContent = result.ok
        ? ''
        : result.error.kind === 'quota-exceeded'
          ? t('storage.full')
          : t('storage.failed');
    }

    /* ---------------------------------------------------------------- labels */
    function quantityLabel(quantity: Quantity): string {
      const value = formatNumber(quantity.value, intlTag(), 2);
      switch (quantity.unit) {
        case 'g':
          return t('recipes.unit.g', { count: value });
        case 'ml':
          return t('recipes.unit.ml', { count: value });
        case 'l':
          return t('recipes.unit.l', { count: value });
        case 'piece':
          return plural('recipes.unit.piece', quantity.value, { count: value });
        case 'can':
          return plural('recipes.unit.can', quantity.value, { count: value });
        case 'bunch':
          return plural('recipes.unit.bunch', quantity.value, { count: value });
      }
    }

    /* ------------------------------------------------------------ recipe tab */
    function recipeCard(recipe: Recipe): HTMLElement {
      const chosen = selected.has(recipe.id);

      const toggle = el('button', {
        class: ['btn', 'btn--sm', 'recipe__toggle'],
        attrs: { type: 'button', 'aria-pressed': chosen },
        text: chosen ? t('recipes.added') : t('recipes.add'),
        on: {
          click: () => {
            const nowChosen = !selected.has(recipe.id);
            if (nowChosen) selected.add(recipe.id);
            else selected.delete(recipe.id);

            /* This button's own label and the count above it are the only things
               on this panel that changed, so they are updated in place rather
               than by rebuilding every card to flip one of them. */
            toggle.setAttribute('aria-pressed', String(nowChosen));
            toggle.textContent = nowChosen ? t('recipes.added') : t('recipes.add');
            updateSelectionBadge();

            persist();
            invalidate('shopping');
          },
        },
      });

      const details = el(
        'details',
        { class: 'recipe__details', attrs: { open: openRecipes.has(recipe.id) } },
        /*
         * The recipe's name lives inside the `<summary>`, so tapping anywhere
         * along the row opens it — the whole row is the disclosure control.
         * The name used to sit outside, and the only thing that opened a recipe
         * was the word "Method", which is a small target and not the one anyone
         * aims at. A heading is one of the two things `<summary>` is allowed to
         * contain, so the outline keeps its `h3`.
         */
        el(
          'summary',
          { class: 'recipe__head' },
          el('h3', { class: 'recipe__name', text: recipe.name[locale()] }),
        ),
        el(
          'div',
          { class: 'stack recipe__body' },
          el('h4', {
            class: 'recipe__label',
            /* The heading states the person count so the scaled amounts below it
               are never read as "per portion" by mistake. */
            text: plural('recipes.ingredients', persons),
          }),
          el(
            'ul',
            { class: 'recipe__ingredients' },
            ...portionsFor(recipe, persons).map((portion) =>
              el(
                'li',
                {},
                el('span', {
                  class: 'recipe__amount numeric',
                  text: quantityLabel(portion.quantity),
                }),
                el('span', { text: portion.ingredient.name[locale()] }),
              ),
            ),
          ),
          el('h4', { class: 'recipe__label', text: t('recipes.steps') }),
          el(
            'ol',
            { class: 'recipe__steps' },
            ...recipe.steps[locale()].map((step) => el('li', { text: step })),
          ),
        ),
      );

      details.addEventListener('toggle', () => {
        if (details.open) openRecipes.add(recipe.id);
        else openRecipes.delete(recipe.id);
      });

      /*
       * A row on a rule, and no picture.
       *
       * Every recipe used to carry an emoji, which is a font the site does not
       * control — flat two-colour glyphs beside shaded three-dimensional ones,
       * on no common grid, in nobody's stroke weight, none of them taking the
       * text colour. `shell/icons.ts` exists because that read as clip art in
       * the app bar; twenty-five of them down one page read as it rather more.
       * The names are descriptive on their own.
       */
      /* The Add button is a sibling of the `<details>`, not part of the summary:
         nesting a button inside a disclosure control means one tap would both
         add the recipe and open it. It is positioned back into the row visually. */
      return el('article', { class: 'recipe' }, details, toggle);
    }

    /** Refresh the chosen-recipe count without rebuilding the panel around it. */
    function updateSelectionBadge(): void {
      if (selectionBadge === undefined) return;
      selectionBadge.textContent = plural('recipes.selected', selected.size);
    }

    function renderRecipesPanel(): void {
      selectionBadge = el('span', {
        class: 'badge',
        text: plural('recipes.selected', selected.size),
      });

      const summary = el(
        'section',
        { class: 'section' },
        el(
          'div',
          { class: 'section__head' },
          el('h2', { text: t('recipes.collection.title') }),
          selectionBadge,
        ),
        el('p', { class: 'note', text: t('recipes.collection.hint') }),
        el(
          'div',
          { class: 'cluster' },
          el('button', {
            class: ['btn', 'btn--sm'],
            attrs: { type: 'button' },
            text: t('recipes.selectAll'),
            on: {
              click: () => {
                for (const recipe of RECIPES) selected.add(recipe.id);
                persist();
                invalidate('recipes', 'shopping');
              },
            },
          }),
          el('button', {
            class: ['btn', 'btn--sm', 'btn--danger'],
            attrs: { type: 'button' },
            text: t('recipes.clearSelection'),
            on: {
              click: () => {
                selected.clear();
                persist();
                invalidate('recipes', 'shopping');
              },
            },
          }),
        ),
      );

      const sections = MEAL_ORDER.map((meal) =>
        el(
          'section',
          { class: 'section' },
          el(
            'div',
            { class: 'section__head' },
            el('h2', { class: 'label', text: t(`recipes.meal.${meal}`) }),
          ),
          el('div', { class: 'recipes-list' }, ...recipesOf(meal).map(recipeCard)),
        ),
      );

      recipesPanel.replaceChildren(summary, ...sections);
    }

    /* ---------------------------------------------------------- shopping tab */
    function item(options: {
      readonly checkId: string;
      readonly name: string;
      readonly detail: string;
      readonly own?: boolean;
      readonly badge?: Child;
      readonly onRemove?: () => void;
    }): HTMLElement {
      const isChecked = checked.has(options.checkId);

      const box = el('input', { attrs: { type: 'checkbox', checked: isChecked } });

      /* The tick is a sibling element, not a pseudo-element; see `.checkbox`. */
      const control = el(
        'span',
        { class: 'checkbox' },
        box,
        el('span', { class: 'checkbox__tick', attrs: { 'aria-hidden': 'true' }, text: '✓' }),
      );

      const row = el(
        'li',
        {
          class: [
            'recipes-item',
            options.own === true && 'recipes-item--own',
            isChecked && 'is-checked',
          ],
        },
        el(
          'label',
          { class: 'recipes-item__label' },
          control,
          el(
            'span',
            { class: 'recipes-item__text' },
            el('span', { class: 'recipes-item__name', text: options.name }),
            options.detail !== '' &&
              el('span', { class: 'recipes-item__detail numeric', text: options.detail }),
          ),
          options.badge,
        ),
        options.onRemove !== undefined &&
          el('button', {
            class: ['btn', 'btn--ghost', 'btn--icon', 'recipes-item__remove'],
            attrs: {
              type: 'button',
              /* The name is in the label so the button is distinguishable from
                 the other remove buttons on the list. */
              'aria-label': t('recipes.custom.remove', { name: options.name }),
              title: t('recipes.custom.remove', { name: options.name }),
            },
            text: '✕',
            on: { click: options.onRemove },
          }),
      );

      box.addEventListener('change', () => {
        if (box.checked) checked.add(options.checkId);
        else checked.delete(options.checkId);
        row.classList.toggle('is-checked', box.checked);
        refreshCounts();
        persist();
      });

      return row;
    }

    /** One row of the shopping list, from either kind of entry. */
    function entryRow(entry: ShoppingEntry): HTMLElement {
      if (entry.kind === 'custom') {
        return item({
          checkId: entry.checkId,
          name: entry.item.name,
          detail: entry.item.note,
          own: true,
          badge: el('span', { class: ['badge', 'badge--own'], text: t('recipes.custom.badge') }),
          onRemove: () => {
            custom = removeCustomItem(custom, entry.item.id);
            checked.delete(entry.checkId);
            persist();
            invalidate('shopping');
          },
        });
      }

      return item({
        checkId: entry.checkId,
        name: entry.ingredient.name[locale()],
        detail: quantityLabel(entry.quantity),
        badge: el('span', {
          class: ['badge', entry.ingredient.fresh ? 'badge--fresh' : 'badge--stable'],
          text: entry.ingredient.fresh ? t('recipes.fresh') : t('recipes.stable'),
        }),
      });
    }

    function itemCard(options: {
      readonly title: string;
      readonly note?: string;
      readonly ids: readonly string[];
      readonly rows: readonly HTMLElement[];
      readonly action?: {
        readonly label: string;
        readonly message: string;
        readonly scope: TickScope;
      };
    }): HTMLElement {
      const count = el('span', { class: 'recipes-count numeric' });
      counters.push({ element: count, ids: options.ids });

      const action = options.action;

      return el(
        'section',
        { class: 'section' },
        el('div', { class: 'section__head' }, el('h2', { text: options.title }), count),
        options.note !== undefined && el('p', { class: 'note', text: options.note }),
        el('ul', { class: 'recipes-items' }, ...options.rows),
        action !== undefined && el('div', { class: 'recipes-card-actions' }, resetButton(action)),
      );
    }

    /**
     * A button that clears one half of the ticks.
     *
     * The two halves are cleared separately because they are restocked on
     * different rhythms: the ingredients change with every set of recipes, the
     * cupboard staples are checked every few weeks. With one button for both,
     * clearing a finished shopping trip also wiped which staples were still in.
     */
    function resetButton(action: {
      readonly label: string;
      readonly message: string;
      readonly scope: TickScope;
    }): HTMLElement {
      return el('button', {
        class: ['btn', 'recipes-reset'],
        attrs: { type: 'button' },
        text: action.label,
        on: {
          click: () => {
            void (async () => {
              const confirmed = await confirmDialog({
                message: action.message,
                destructive: true,
              });
              if (!confirmed) return;
              const kept = clearTicks(checked, action.scope);
              checked.clear();
              for (const id of kept) checked.add(id);
              persist();
              invalidate('shopping');
            })();
          },
        },
      });
    }

    function renderShoppingPanel(): void {
      counters = [];

      const groups = shoppingList(selectedRecipes(selected), persons, custom);
      const stapleIds = STAPLES.map((staple) => stapleCheckId(staple.id));
      allCheckIds = [
        ...groups.flatMap((group) => group.entries.map((entry) => entry.checkId)),
        ...stapleIds,
      ];

      progressFill = el('div', { class: 'recipes-progress__fill' });
      progressLabel = el('p', { class: 'note numeric' });

      const meta = el(
        'section',
        { class: 'stack recipes-meta' },
        el('div', { class: 'recipes-progress', attrs: { 'aria-hidden': 'true' } }, progressFill),
        progressLabel,
        el(
          'ul',
          { class: 'recipes-legend' },
          el(
            'li',
            {},
            el('span', {
              class: 'recipes-dot recipes-dot--fresh',
              attrs: { 'aria-hidden': 'true' },
            }),
            t('recipes.legend.fresh'),
          ),
          el(
            'li',
            {},
            el('span', {
              class: 'recipes-dot recipes-dot--stable',
              attrs: { 'aria-hidden': 'true' },
            }),
            t('recipes.legend.stable'),
          ),
        ),
      );

      const groupCards = groups.map((group) =>
        itemCard({
          title: t(`recipes.category.${group.category}`),
          ids: group.entries.map((entry) => entry.checkId),
          rows: group.entries.map(entryRow),
        }),
      );

      /*
       * One button for the whole ingredient half, rather than one per aisle:
       * six identical reset buttons down the page would be noise, and the thing
       * being cleared is the shopping trip, not the fruit section.
       */
      const resetIngredients = el(
        'div',
        { class: 'recipes-card-actions recipes-card-actions--standalone' },
        resetButton({
          label: t('recipes.reset.ingredients'),
          message: t('recipes.confirmReset.ingredients'),
          scope: 'ingredients',
        }),
      );

      const staplesCard = itemCard({
        title: t('recipes.staples.title'),
        note: t('recipes.staples.note'),
        ids: stapleIds,
        rows: STAPLES.map((staple) =>
          item({
            checkId: stapleCheckId(staple.id),
            name: staple.name[locale()],
            detail: staple.note[locale()],
          }),
        ),
        action: {
          label: t('recipes.reset.staples'),
          message: t('recipes.confirmReset.staples'),
          scope: 'staples',
        },
      });

      shoppingPanel.replaceChildren(
        meta,
        ...(countEntries(groups) === 0
          ? [el('p', { class: 'empty', text: t('recipes.empty') })]
          : [...groupCards, resetIngredients]),
        addOwnItemCard(),
        staplesCard,
      );

      refreshCounts();
    }

    /**
     * The form for putting something on the list by hand.
     *
     * A real `<form>` rather than a button and two inputs, so Return submits and
     * the browser's own required-field handling applies. It sits below the
     * aisles it feeds, and the item lands in whichever aisle was chosen.
     */
    function addOwnItemCard(): HTMLElement {
      const nameInput = el('input', {
        class: 'input',
        id: 'recipes-own-name',
        attrs: {
          type: 'text',
          maxlength: MAX_CUSTOM_NAME,
          autocomplete: 'off',
          placeholder: t('recipes.custom.namePlaceholder'),
          required: true,
        },
      });

      const noteInput = el('input', {
        class: 'input',
        id: 'recipes-own-note',
        attrs: {
          type: 'text',
          maxlength: MAX_CUSTOM_NOTE,
          autocomplete: 'off',
          placeholder: t('recipes.custom.notePlaceholder'),
        },
      });

      const categorySelect = el('select', {
        id: 'recipes-own-category',
        children: CATEGORY_ORDER.map((category) =>
          el('option', {
            attrs: { value: category, selected: category === lastCategory },
            text: t(`recipes.category.${category}`),
          }),
        ),
      });

      const message = el('p', { class: 'msg', attrs: { role: 'status' } });

      const form = el(
        'form',
        { class: 'recipes-own-form' },
        el(
          'div',
          { class: 'recipes-own-form__row' },
          el(
            'div',
            {},
            el('label', {
              attrs: { for: 'recipes-own-name' },
              text: t('recipes.custom.name'),
            }),
            nameInput,
          ),
          el(
            'div',
            {},
            el('label', {
              attrs: { for: 'recipes-own-note' },
              text: t('recipes.custom.note'),
            }),
            noteInput,
          ),
        ),
        el(
          'div',
          { class: 'recipes-own-form__row' },
          el(
            'div',
            {},
            el('label', {
              attrs: { for: 'recipes-own-category' },
              text: t('recipes.custom.category'),
            }),
            categorySelect,
          ),
          el(
            'div',
            { class: 'recipes-own-form__submit' },
            el('button', {
              class: ['btn', 'btn--primary'],
              attrs: { type: 'submit' },
              text: t('recipes.custom.add'),
            }),
          ),
        ),
        message,
      );

      form.addEventListener('submit', (event) => {
        event.preventDefault();

        const name = nameInput.value.trim();
        if (name === '') {
          message.textContent = t('recipes.custom.nameRequired');
          nameInput.focus();
          return;
        }
        if (custom.length >= MAX_CUSTOM_ITEMS) {
          message.textContent = t('recipes.custom.full', { limit: MAX_CUSTOM_ITEMS });
          return;
        }

        const category = asCategory(categorySelect.value);
        custom = addCustomItem(custom, { name, note: noteInput.value, category });
        /* Remembered for the next item: a shop is walked aisle by aisle, so the
           next thing being added is usually from the same one. */
        lastCategory = category;
        persist();
        invalidate('shopping');

        /* The panel was rebuilt, so the focus target is the new form's input. */
        const fresh = document.querySelector<HTMLInputElement>('#recipes-own-name');
        fresh?.focus();
      });

      return el(
        'section',
        { class: 'section recipes-own' },
        el(
          'div',
          { class: 'section__head' },
          el('h2', { text: t('recipes.custom.title') }),
          el('span', {
            class: 'recipes-count numeric',
            text: t('recipes.count', { done: custom.length, total: MAX_CUSTOM_ITEMS }),
          }),
        ),
        el('p', { class: 'note', text: t('recipes.custom.hint') }),
        form,
      );
    }

    /** Narrow the select's value back to a category, defaulting to the first aisle. */
    function asCategory(value: string): Category {
      return CATEGORY_ORDER.find((category) => category === value) ?? 'fruit';
    }

    /** Update every counter and the progress bar from the current ticks. */
    function refreshCounts(): void {
      for (const counter of counters) {
        const done = counter.ids.filter((id) => checked.has(id)).length;
        counter.element.textContent = t('recipes.count', {
          done,
          total: counter.ids.length,
        });
      }

      const total = allCheckIds.length;
      const done = allCheckIds.filter((id) => checked.has(id)).length;
      if (progressLabel !== undefined) {
        progressLabel.textContent = t('recipes.progress', { done, total });
      }
      if (progressFill !== undefined) {
        /* A custom property rather than `style.width`, as the Sudoku picker does:
           the stylesheet keeps the layout and only the one number crosses over. */
        const percent = total === 0 ? 0 : (100 * done) / total;
        progressFill.style.setProperty('--fill', `${String(percent)}%`);
      }
    }

    /* ---------------------------------------------------------------- chrome */

    /** Reflect the current tab onto the buttons and panels. */
    function applyTabState(): void {
      recipesTab.setAttribute('aria-pressed', String(currentTab === 'recipes'));
      shoppingTab.setAttribute('aria-pressed', String(currentTab === 'shopping'));
      recipesPanel.hidden = currentTab !== 'recipes';
      shoppingPanel.hidden = currentTab !== 'shopping';
    }

    /**
     * Rebuild the visible panel if the state has moved on since it was drawn.
     *
     * The hidden panel is deliberately left stale. Rendering it would be work
     * nobody can see, and it is rebuilt the moment it is shown, so the only
     * thing deferring it costs is that a panel switched to may take its render
     * then rather than earlier.
     */
    function refresh(): void {
      personsCount.textContent = formatNumber(persons, intlTag(), 0);

      if (currentTab === 'recipes' && stale.recipes) {
        renderRecipesPanel();
        stale.recipes = false;
      } else if (currentTab === 'shopping' && stale.shopping) {
        renderShoppingPanel();
        stale.shopping = false;
      }

      applyTabState();
    }

    /** Mark panels as out of date, then redraw whichever one is on screen. */
    function invalidate(...panels: readonly ('recipes' | 'shopping')[]): void {
      for (const panel of panels) stale[panel] = true;
      refresh();
    }

    function showTab(tab: 'recipes' | 'shopping'): void {
      currentTab = tab;
      refresh();
    }

    function setPersons(next: number): void {
      const clamped = clampPersons(next);
      if (clamped === persons) return;
      persons = clamped;
      persist();
      /* Both panels show scaled amounts, so both are now out of date. */
      invalidate('recipes', 'shopping');
    }

    /* --------------------------------------------------------------- wiring */
    recipesTab.addEventListener('click', () => {
      showTab('recipes');
    });
    shoppingTab.addEventListener('click', () => {
      showTab('shopping');
    });
    minusButton.addEventListener('click', () => {
      setPersons(persons - 1);
    });
    plusButton.addEventListener('click', () => {
      setPersons(persons + 1);
    });

    refresh();
  },
});
