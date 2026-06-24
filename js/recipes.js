/**
 * Recipe suggestions — filters pantry items against RECIPES, allergy restrictions, and tags.
 * Exposes window.* handlers for inline onclick attributes in index.html.
 */
import {
  allFood,
  activeRecFilters,
  activeAllergies,
  customRestrictions,
  currentUser,
  userDoc,
} from './state.js';
import {
  RECIPES,
  ALLERGY_LIST,
  ALLERGY_LABELS,
  NEED_ALIASES,
  CAT_ICONS,
} from './constants.js';
import { escapeHTML, norm } from './utils.js';
import { openModal, closeModal, showToast } from './ui.js';
import { savePreferences } from './firestore-service.js';
import { refreshAccountUI } from './settings.js';

/** Match a pantry item to a recipe ingredient need via alias list. */
function findUserFood(need) {
  const aliases = NEED_ALIASES[need] || [need];
  return allFood.find((item) => {
    const n = item.name.toLowerCase();
    return aliases.some((a) => n.includes(a));
  });
}

/** Recipe is shown only when every required need is in the user's pantry. */
function recipeFullyAvailable(recipe) {
  return (recipe.needs || []).every((need) => !!findUserFood(need));
}

/** Build chip data for each ingredient need (in stock vs need to buy). */
function buildRecipeChips(recipe) {
  return (recipe.needs || []).map((need) => {
    const match = findUserFood(need);
    return {
      t: match ? 'ch' : 'cn',
      l: `${match ? match.icon : CAT_ICONS[need] || '🛒'} ${need}`,
    };
  });
}

/** True when recipe text/tags conflict with an allergy or diet key. */
function violatesRestriction(recipe, key) {
  const text = (
    recipe.name + ' ' + recipe.tags.join(' ') + ' ' +
    (recipe.needs || []).join(' ') + ' ' +
    recipe.ingredients.map((i) => i.n).join(' ')
  ).toLowerCase();
  if (key === 'gluten') return !recipe.tags.includes('glutenfree');
  if (key === 'dairy') {
    return !recipe.tags.includes('dairyfree') && (
      text.includes('yogurt') || text.includes('cheddar') ||
      text.includes('cheese') || text.includes('butter') || text.includes('milk')
    );
  }
  if (key === 'eggs') return text.includes('egg');
  if (key === 'meat') return !recipe.tags.includes('vegetarian');
  return text.includes(key);
}

/** Merge built-in allergy list with user-defined custom restrictions. */
function getAllRestrictionTags() {
  const merged = [...ALLERGY_LIST];
  customRestrictions.forEach((c) => {
    if (!merged.some((m) => norm(m) === norm(c))) merged.push(c);
  });
  return merged;
}

/** Banner on recipes tab when items are expiring within 4 days. */
export function updateRecipeAlert() {
  const el = document.getElementById('rec-alert');
  const txt = document.getElementById('rec-alert-text');
  if (!el || !txt) return;
  const expiring = allFood.filter((i) => typeof i.days === 'number' && i.days <= 4);
  if (!expiring.length) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'flex';
  const names = expiring.slice(0, 3).map((i) => i.name.toLowerCase()).join(', ');
  txt.innerHTML = `Recipes use what you have — including <strong>${escapeHTML(names)}</strong>${expiring.length > 3 ? ' & more' : ''} expiring soon.`;
}

/** Render filtered recipe cards into #rec-list. */
export function renderRec() {
  const listEl = document.getElementById('rec-list');
  if (!listEl) return;

  let items = RECIPES.filter(recipeFullyAvailable);

  if (!activeRecFilters.has('all')) {
    items = items.filter((recipe) => {
      for (const f of activeRecFilters) {
        if (f === 'quick' && !recipe.tags.includes('quick')) return false;
        if (f === 'under30' && recipe.time > 30) return false;
        if (f === 'under60' && recipe.time > 60) return false;
        if (f !== 'quick' && f !== 'under30' && f !== 'under60' && !recipe.tags.includes(f)) return false;
      }
      return true;
    });
  }

  if (activeAllergies.size > 0) {
    items = items.filter((recipe) => {
      for (const a of activeAllergies) {
        if (violatesRestriction(recipe, a)) return false;
      }
      return true;
    });
  }

  const emptyMsg = allFood.length
    ? '<div style="text-align:center;padding:24px;color:var(--txt2)"><i class="ti ti-mood-empty" style="font-size:28px;display:block;margin-bottom:8px"></i>No recipes match your food yet</div>'
    : '<div style="text-align:center;padding:24px;color:var(--txt2)"><i class="ti ti-mood-empty" style="font-size:28px;display:block;margin-bottom:8px"></i>Add food to your fridge or cabinet to see recipes</div>';

  listEl.innerHTML = items.length
    ? items.map((r) => {
        const chips = buildRecipeChips(r);
        const idx = RECIPES.indexOf(r);
        return `<div class="rc" onclick="showRecipeDetail(${idx})" style="cursor:pointer"><div class="rtop"><div class="rn">${escapeHTML(r.name)}</div><div class="rt"><i class="ti ti-clock" style="font-size:12px"></i>${r.time} min</div></div><div class="chips">${chips.map((c) => `<span class="chip ${c.t}">${c.l}</span>`).join('')}</div></div>`;
      }).join('')
    : emptyMsg;
}

/** Multi-select recipe filter pills (meal type, time, dietary). */
export function rFilter(f, el) {
  if (f === 'all') {
    activeRecFilters.clear();
    activeRecFilters.add('all');
    document.querySelectorAll('#rec-pills .fp').forEach((p) => p.classList.remove('on', 'multi-on'));
    el.classList.add('on');
  } else {
    activeRecFilters.delete('all');
    document.querySelector('#rec-pills .fp:first-child')?.classList.remove('on');
    if (activeRecFilters.has(f)) {
      activeRecFilters.delete(f);
      el.classList.remove('multi-on');
    } else {
      activeRecFilters.add(f);
      el.classList.add('multi-on');
    }
    if (activeRecFilters.size === 0) {
      activeRecFilters.add('all');
      document.querySelector('#rec-pills .fp:first-child')?.classList.add('on');
    }
  }
  renderRec();
}

/** Full recipe detail modal with ingredient checklist. */
export function showRecipeDetail(idx) {
  const recipe = RECIPES[idx];
  if (!recipe) return;

  const ingRows = recipe.ingredients.map((ing) => {
    const have = allFood.some((f) => {
      const n = f.name.toLowerCase();
      const k = ing.n.toLowerCase();
      return n.includes(k) || k.includes(n) || k.split(' ').some((w) => w.length > 3 && n.includes(w));
    });
    return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:0.5px solid var(--bdr);font-size:13px"><span style="color:var(--txt)">${escapeHTML(ing.n)}${have ? ' <span style="color:#3B6D11;font-size:11px">✓ yours</span>' : ' <span style="color:var(--txt3);font-size:11px">optional</span>'}</span><span style="color:var(--txt2)">${escapeHTML(ing.a)}</span></div>`;
  }).join('');

  openModal(`<div class="modal-wrap"><div class="modal"><div class="mhdl"></div><div class="mtitle">${escapeHTML(recipe.name)}</div><div class="rt" style="margin-bottom:12px"><i class="ti ti-clock" style="font-size:12px"></i>${recipe.time} min</div><p style="font-size:13px;color:var(--txt2);line-height:1.55;margin-bottom:14px">${escapeHTML(recipe.desc)}</p><div class="slbl" style="padding:0 0 8px">Ingredients</div>${ingRows}<button class="mbtn-p" onclick="closeModal()" style="width:100%;margin-top:14px">Close</button></div></div>`);
}

/** Allergy & dietary restriction picker modal. */
export function showAllergyModal() {
  const tags = getAllRestrictionTags();
  openModal(`<div class="modal-wrap"><div class="modal"><div class="mhdl"></div><div class="mtitle">Allergies & dietary restrictions</div><p style="font-size:13px;color:var(--txt2);margin-bottom:12px">Tap to toggle. Custom restrictions are saved to your account.</p><div class="allergy-grid" id="a-grid">${tags.map((a) => {
    const k = norm(a);
    const cIdx = customRestrictions.findIndex((c) => norm(c) === k);
    const isCustom = cIdx >= 0;
    return `<div class="atag ${activeAllergies.has(k) ? 'on' : ''}" onclick="toggleAllergy(this)">${escapeHTML(a)}${isCustom ? `<span onclick="event.stopPropagation();removeCustomRestriction(${cIdx})" style="margin-left:6px;color:#A32D2D;font-weight:700;cursor:pointer">×</span>` : ''}</div>`;
  }).join('')}</div><label class="flabel">Add another restriction</label><input class="inp" id="custom-allergy" placeholder="Example: avocado, honey, pork" style="margin-bottom:4px"><div class="mbtn-row"><button class="mbtn-s" onclick="closeModal()">Cancel</button><button class="mbtn-p" onclick="saveAllergies()">Save restrictions</button></div></div></div>`);
}

/** Toggle allergy tag selection in the modal (visual only until save). */
export function toggleAllergy(el) {
  el.classList.toggle('on');
}

/** Remove a user-added custom restriction and refresh the modal. */
export function removeCustomRestriction(idx) {
  const label = customRestrictions[idx];
  if (!label) return;
  customRestrictions.splice(idx, 1);
  activeAllergies.delete(norm(label));
  showAllergyModal();
}

/** Persist selected allergies and custom restrictions to Firestore. */
export async function saveAllergies() {
  activeAllergies.clear();
  document.querySelectorAll('#a-grid .atag').forEach((el) => {
    if (!el.classList.contains('on')) return;
    const txt = norm(el.textContent.replace('×', '').trim());
    activeAllergies.add(txt);
  });

  const customInput = (document.getElementById('custom-allergy')?.value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  customInput.forEach((v) => {
    const k = norm(v);
    activeAllergies.add(k);
    ALLERGY_LABELS[k] = v;
    if (!customRestrictions.some((c) => norm(c) === k)) customRestrictions.push(v);
  });

  closeModal();

  if (!currentUser) {
    refreshAccountUI();
    renderRec();
    return;
  }

  try {
    const prefs = {
      ...userDoc?.preferences,
      allergies: [...activeAllergies],
      customRestrictions: [...customRestrictions],
    };
    await savePreferences(currentUser.uid, prefs);
    showToast('Restrictions saved.', 'success');
    refreshAccountUI();
  } catch (err) {
    showToast(err.message || 'Could not save restrictions.', 'error');
  }
  renderRec();
}

/** Attach recipe handlers to window for HTML onclick attributes. */
export function bindRecipeHandlers() {
  window.renderRec = renderRec;
  window.updateRecipeAlert = updateRecipeAlert;
  window.rFilter = rFilter;
  window.showRecipeDetail = showRecipeDetail;
  window.showAllergyModal = showAllergyModal;
  window.saveAllergies = saveAllergies;
  window.toggleAllergy = toggleAllergy;
  window.removeCustomRestriction = removeCustomRestriction;
}
