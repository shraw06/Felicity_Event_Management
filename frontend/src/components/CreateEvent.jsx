import React, { useEffect, useState, useCallback } from 'react';
import { eventAPI, organizerAPI } from '../services/api';
import { useNavigate, useLocation } from 'react-router-dom';

const FIELD_TYPES = ['text','number','dropdown','checkbox','file'];

const AREAS = [
  'Arts & Performance',
  'Technology & Innovation',
  'Gaming & Esports',
  'Knowledge & Speaking',
  'Creative & Design',
  'Sports & Fitness',
  'Career & Workshops',
  'Social & Fun Events'
];

const STATUS_COLORS = {
  draft: '#ffc107',
  published: '#17a2b8',
  ongoing: '#28a745',
  completed: '#6c757d',
  closed: '#dc3545',
};

// Helpers to format/normalize datetime-local values consistently in local time
function formatForInput(dateValue) {
  if (!dateValue) return '';
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toIsoIfLocal(value) {
  if (!value) return undefined;
  // If it's already an ISO-like string, normalize via Date
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d.toISOString();
  return value;
}

function FieldEditor({ field, index, onChange, onMoveUp, onMoveDown, onRemove, disabled, isLast }){
  const set = (patch) => onChange(index, { ...field, ...patch });
  return (
    <div style={{ border: '1px solid #ddd', padding: 8, marginBottom: 8, opacity: disabled?0.6:1 }}>
      <div style={{ display:'flex', gap:8 }}>
        <input name="title" placeholder="Label / Title" value={field.title} onChange={e=>set({title:e.target.value})} disabled={disabled} />
        <input name="name" placeholder="name (unique)" value={field.name} onChange={e=>set({name:e.target.value})} disabled={disabled} />
        <select value={field.type} onChange={e=>set({type:e.target.value, choices: [], choicesText: ''})} disabled={disabled}>
          {FIELD_TYPES.map(t=> <option key={t} value={t}>{t}</option>)}
        </select>
        <label style={{display:'flex', alignItems:'center', gap:6}}>
          <input type="checkbox" checked={!!field.required} onChange={e=>set({required:e.target.checked})} disabled={disabled}/> Required
        </label>
      </div>
      {(field.type === 'dropdown' || field.type === 'checkbox') && (
        <div style={{ marginTop:8 }}>
          <label>Choices (comma separated)</label>
          <input
            value={field.choicesText || ''}
            onChange={e => set({ choicesText: e.target.value })}
            disabled={disabled}
          />
        </div>
      )}
      <div style={{ marginTop:8, display:'flex', gap:8 }}>
        <button onClick={onMoveUp} disabled={disabled || index===0}>Up</button>
        <button onClick={onMoveDown} disabled={disabled || isLast}>Down</button>
        <button onClick={onRemove} disabled={disabled}>Remove</button>
      </div>
    </div>
  );
}

const EMPTY_EVENT = {
  name: '', description: '', type: '', non_iiit_eligibility: false, registration_deadline:'', event_start_date:'', event_end_date:'',
  registration_limit: 0, registration_fee: 0, event_tags: [], formFields: [],
  // merchandise is only present for merchandise events; keep undefined by default
  merchandise: undefined,
  status: 'draft', form_locked: false,
};

export default function CreateEvent(){
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // The event currently being edited in the form builder
  const [event, setEvent] = useState({ ...EMPTY_EVENT });
  const [editingId, setEditingId] = useState(null); // _id of event being edited, null = new

  // Check if we're editing an existing event (passed via state)
  useEffect(() => {
    const eventToEdit = location.state?.eventToEdit;
    if (eventToEdit) {
      const formFields = (eventToEdit.formFields || []).map(f => ({
        ...f,
        choicesText: (f.choices || []).join(', '),
      }));
      // Normalize merchandise items for editing (convert arrays back to comma-separated text)
      const merchandise = eventToEdit.merchandise
        ? (eventToEdit.merchandise || []).map(it => ({
            ...it,
            sizesText: (it.sizes || []).join(', '),
            colorsText: (it.colors || []).join(', '),
            variantsText: (it.variants || []).join(', '),
          }))
        : undefined;
      setEvent({ ...eventToEdit, formFields, merchandise });
      setEditingId(eventToEdit._id);
    } else {
      // Reset to empty event for new creation
      setEvent({ ...EMPTY_EVENT });
      setEditingId(null);
    }
  }, [location.state]);

  const setField = (k, v) => setEvent(prev => ({ ...prev, [k]: v }));

  // ---------- Form builder helpers ----------
  const addField = () => {
    const nextPos = (event.formFields || []).length;
    const f = { position: nextPos, type: 'text', name: `field_${Date.now()}`, title: 'Untitled', choices: [], choicesText: '', required: false };
    setEvent(prev => ({ ...prev, formFields: [...(prev.formFields||[]), f] }));
  };

  // ---------- Merchandise helpers ----------
  const addItem = () => {
    const newItem = {
      itemName: '',
      sizesText: '',
      colorsText: '',
      variantsText: '',
      stockQuantity: 0,
      purchaseLimitPerParticipant: 1,
    };
    setEvent(prev => ({ ...prev, merchandise: [...(prev.merchandise || []), newItem] }));
  };

  const updateItem = (index, patch) => {
    const arr = [...(event.merchandise || [])];
    arr[index] = { ...arr[index], ...patch };
    setEvent(prev => ({ ...prev, merchandise: arr }));
  };

  const removeItem = (index) => {
    const arr = [...(event.merchandise || [])];
    arr.splice(index, 1);
    setEvent(prev => ({ ...prev, merchandise: arr }));
  };

  // Auto-add one item when type becomes 'merchandise' and no items exist
  useEffect(() => {
    if (event.type === 'merchandise' && (!event.merchandise || event.merchandise.length === 0)) {
      addItem();
    }
  }, [event.type]);

  const prepareMerchandise = (items = []) => {
    if (!Array.isArray(items)) return [];
    return items
      .map(it => ({
        itemName: (it.itemName || '').trim(),
        sizes: (it.sizesText || '').split(',').map(s => s.trim()).filter(Boolean),
        colors: (it.colorsText || '').split(',').map(s => s.trim()).filter(Boolean),
        variants: (it.variantsText || '').split(',').map(s => s.trim()).filter(Boolean),
        stockQuantity: Number(it.stockQuantity) || 0,
        purchaseLimitPerParticipant: Number(it.purchaseLimitPerParticipant) || 1,
      }))
      .filter(it => it.itemName.length > 0); // keep only items with a name
  };

  const updateField = (index, field) => {
    const arr = [...(event.formFields||[])];
    arr[index] = { ...field, position: index };
    const normalized = arr.map((f,i)=>({ ...f, position: i }));
    setEvent(prev=> ({ ...prev, formFields: normalized }));
  };
  const removeField = (index) => {
    const arr = [...(event.formFields||[])]; arr.splice(index,1);
    const normalized = arr.map((f,i)=>({ ...f, position: i }));
    setEvent(prev=> ({ ...prev, formFields: normalized }));
  };
  const moveField = (from, to) => {
    const arr = [...(event.formFields||[])];
    if (to<0 || to>=arr.length) return;
    const item = arr.splice(from,1)[0]; arr.splice(to,0,item);
    const normalized = arr.map((f,i)=>({ ...f, position: i }));
    setEvent(prev=> ({ ...prev, formFields: normalized }));
  };

  // Convert choicesText → choices array for payload
  const prepareFormFields = (fields) =>
    (fields || []).map(f => ({
      ...f,
      choices: f.choicesText
        ? f.choicesText.split(',').map(s => s.trim()).filter(Boolean)
        : (f.choices || []),
    }));

  // ---------- Validation ----------
  const validateBeforePublish = () => {
    if (!event.name) return 'Event name is required.';
    if (!event.description) return 'Event description is required.';
    if (!event.type) return 'Event type is required.';
    // Only 'normal' events require form fields
    if (event.type === 'normal') {
      if (!event.formFields || event.formFields.length === 0) return 'At least one form field is required.';
      const names = event.formFields.map(f=>f.name);
      if (new Set(names).size !== names.length) return 'Field names must be unique.';
      for (const f of event.formFields) {
        if (['dropdown','checkbox'].includes(f.type)) {
          const choices = f.choicesText ? f.choicesText.split(',').map(s=>s.trim()).filter(Boolean) : (f.choices||[]);
          if (choices.length === 0) return `Field "${f.title}" requires choices.`;
        }
      }
    }

    // Validate merchandise items
    if (event.type === 'merchandise') {
      const prepared = prepareMerchandise(event.merchandise);
      if (!prepared || prepared.length === 0) return 'Merchandise events must define at least one item.';
      for (const it of prepared) {
        if (!it.itemName) return 'Each merchandise item must have a name.';
        if (it.stockQuantity < 0) return 'Stock quantity cannot be negative.';
        if (it.purchaseLimitPerParticipant < 0) return 'Purchase limit cannot be negative.';
      }
    }
    return null;
  };

  // ---------- Save / Publish / Status ----------
  const saveDraft = async () => {
    setMessage(null); setLoading(true);
    try {
      // Defensive: if type is merchandise ensure at least one valid item is present
      if (event.type === 'merchandise') {
        const merchPrepared = prepareMerchandise(event.merchandise);
        if (!merchPrepared || merchPrepared.length === 0) {
          setMessage('Please add at least one merchandise item before saving.');
          setLoading(false);
          return;
        }
      }

      const merchandisePayload = event.type === 'merchandise' ? prepareMerchandise(event.merchandise) : undefined;
      const payload = { ...event, formFields: prepareFormFields(event.formFields), merchandise: merchandisePayload };
      if (typeof payload.event_tags === 'string') payload.event_tags = payload.event_tags.split(',').map(s=>s.trim()).filter(Boolean);
      // Normalize local datetime-local inputs to ISO (so saved values are consistent)
      const normalizedPayload = {
        ...payload,
        registration_deadline: toIsoIfLocal(payload.registration_deadline),
        event_start_date: toIsoIfLocal(payload.event_start_date),
        event_end_date: toIsoIfLocal(payload.event_end_date),
      };

      let saved;
      if (editingId) {
        const res = await eventAPI.updateEvent(editingId, normalizedPayload);
        saved = res.data.data;
        setMessage('Draft saved');
      } else {
        const res = await eventAPI.createEvent(normalizedPayload);
        saved = res.data.data;
        setEditingId(saved._id);
        setMessage('Draft created');
      }
      // Refresh the form with server data (including _id)
      const formFields = (saved.formFields || []).map(f => ({
        ...f,
        choicesText: (f.choices || []).join(', '),
      }));
      const merchandise = saved.merchandise
        ? (saved.merchandise || []).map(it => ({
            ...it,
            sizesText: (it.sizes || []).join(', '),
            colorsText: (it.colors || []).join(', '),
            variantsText: (it.variants || []).join(', '),
          }))
        : undefined;
      setEvent({ ...saved, formFields, merchandise });
    } catch (err) {
      console.log("FULL ERROR:", err.response?.data);
      setMessage(err?.response?.data?.error || 'Save failed');
    } finally { setLoading(false); }
  };

  const savePublishedEdits = async () => {
    setMessage(null); setLoading(true);
    try {
      const payload = {
        description: event.description,
        registration_deadline: toIsoIfLocal(event.registration_deadline),
        registration_limit: event.registration_limit,
      };
      const res = await eventAPI.updateEvent(editingId, payload);
      const saved = res.data.data;
      const formFields = (saved.formFields || []).map(f => ({
        ...f,
        choicesText: (f.choices || []).join(', '),
      }));
      const merchandise = saved.merchandise
        ? (saved.merchandise || []).map(it => ({
            ...it,
            sizesText: (it.sizes || []).join(', '),
            colorsText: (it.colors || []).join(', '),
            variantsText: (it.variants || []).join(', '),
          }))
        : undefined;
      setEvent({ ...saved, formFields, merchandise });
      setMessage('Changes saved');
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Save failed');
    } finally { setLoading(false); }
  };

  const publish = async () => {
    setMessage(null);
    const v = validateBeforePublish();
    if (v) { setMessage(v); return; }
    setLoading(true);
    try {
      const fields = prepareFormFields(event.formFields);
      const merchandise = event.type === 'merchandise' ? prepareMerchandise(event.merchandise) : undefined;
      let saved;
      if (editingId) {
        // Save all fields first, then publish
        const payload = { ...event, formFields: fields, merchandise, status: 'published' };
        const normalizedPayload = {
          ...payload,
          registration_deadline: toIsoIfLocal(payload.registration_deadline),
          event_start_date: toIsoIfLocal(payload.event_start_date),
          event_end_date: toIsoIfLocal(payload.event_end_date),
        };
        const res = await eventAPI.updateEvent(editingId, normalizedPayload);
        saved = res.data.data;
      } else {
        const payload = { ...event, formFields: fields, merchandise, status: 'published' };
        const normalizedPayload = {
          ...payload,
          registration_deadline: toIsoIfLocal(payload.registration_deadline),
          event_start_date: toIsoIfLocal(payload.event_start_date),
          event_end_date: toIsoIfLocal(payload.event_end_date),
        };
        const res = await eventAPI.createEvent(normalizedPayload);
        saved = res.data.data;
        setEditingId(saved._id);
      }
      const formFields = (saved.formFields || []).map(f => ({
        ...f,
        choicesText: (f.choices || []).join(', '),
      }));
      const savedMerchandise = saved.merchandise
        ? (saved.merchandise || []).map(it => ({
            ...it,
            sizesText: (it.sizes || []).join(', '),
            colorsText: (it.colors || []).join(', '),
            variantsText: (it.variants || []).join(', '),
          }))
        : undefined;
      setEvent({ ...saved, formFields, merchandise: savedMerchandise });
      setMessage('Event published');
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Publish failed');
    } finally { setLoading(false); }
  };

  const changeStatus = async (newStatus) => {
    setMessage(null); setLoading(true);
    try {
      const res = await eventAPI.updateEvent(editingId, { status: newStatus });
      const saved = res.data.data;
      const formFields = (saved.formFields || []).map(f => ({
        ...f,
        choicesText: (f.choices || []).join(', '),
      }));
      const merchandise = saved.merchandise
        ? (saved.merchandise || []).map(it => ({
            ...it,
            sizesText: (it.sizes || []).join(', '),
            colorsText: (it.colors || []).join(', '),
            variantsText: (it.variants || []).join(', '),
          }))
        : undefined;
      setEvent({ ...saved, formFields, merchandise });
      setMessage('Status updated');
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Status change failed');
    } finally { setLoading(false); }
  };

  // ---------- Derived state ----------
  const status = event.status || 'draft';
  const isDraft = status === 'draft';
  const isPublished = status === 'published';
  const isLocked = ['ongoing','completed','closed'].includes(status);
  const disabledFormBuilder = event.form_locked || !isDraft;

  // ---------- Render ----------
  return (
    <div className="create-event container" style={{ maxWidth: 800 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2>{editingId ? `Editing: ${event.name || '(Untitled)'}` : 'Create New Event'}</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {editingId && (
            <span style={{
              background: STATUS_COLORS[status] || '#999',
              color: '#fff',
              padding: '4px 12px',
              borderRadius: 12,
              fontSize: 12,
              textTransform: 'uppercase',
            }}>{status}</span>
          )}
          <button onClick={() => navigate('/organizer/dashboard')} style={{ padding: '6px 12px', fontSize: 12 }}>
            ← Back to Dashboard
          </button>
        </div>
      </div>

      {message && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#eef', borderRadius: 6 }}>{message}</div>}

      {isLocked && (
        <div style={{ padding: '8px 12px', background: '#fff3cd', borderRadius: 6, marginBottom: 12, fontSize: 14 }}>
          This event is <strong>{status}</strong>. No edits are allowed.
        </div>
      )}

      {/* Event fields */}
      <div>
        <label>Title</label>
        <input value={event.name||''} onChange={e=>setField('name', e.target.value)} disabled={!isDraft || isLocked} style={{ width: '100%' }} />
      </div>
      <div style={{ marginTop: 8 }}>
        <label>Description</label>
        <textarea value={event.description||''} onChange={e=>setField('description', e.target.value)} disabled={isLocked} style={{ width: '100%' }} rows={3} />
      </div>
      <div style={{ display:'flex', gap:8, marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          <label>Type</label>
          <select value={event.type||''} onChange={e=>setField('type', e.target.value)} disabled={!isDraft || isLocked} style={{ width: '100%' }}>
            <option value="">-- select type --</option>
            <option value="normal">normal</option>
            <option value="merchandise">merchandise</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label>Registration Deadline</label>
          <input type="datetime-local" value={formatForInput(event.registration_deadline)} onChange={e=>setField('registration_deadline', e.target.value)} disabled={isLocked} style={{ width: '100%' }} />
        </div>
      </div>
      <div style={{ display:'flex', gap:8, marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          <label>Start</label>
          <input type="datetime-local" value={formatForInput(event.event_start_date)} onChange={e=>setField('event_start_date', e.target.value)} disabled={!isDraft || isLocked} style={{ width: '100%' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label>End</label>
          <input type="datetime-local" value={formatForInput(event.event_end_date)} onChange={e=>setField('event_end_date', e.target.value)} disabled={!isDraft || isLocked} style={{ width: '100%' }} />
        </div>
      </div>
      <div style={{ display:'flex', gap:8, marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          <label>Registration Limit</label>
          <input type="number" value={event.registration_limit||0} onChange={e=>setField('registration_limit', Number(e.target.value))} disabled={isLocked} style={{ width: '100%' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label>Fee</label>
          <input type="number" value={event.registration_fee||0} onChange={e=>setField('registration_fee', Number(e.target.value))} disabled={!isDraft || isLocked} style={{ width: '100%' }} />
        </div>
      </div>

      {/* Eligibility: open to all / IIIT-only */}
      <div style={{ display:'flex', gap:8, marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          <label>Eligibility</label>
          <select value={event.non_iiit_eligibility ? 'open' : 'iiit'} onChange={e=>setField('non_iiit_eligibility', e.target.value === 'open')} disabled={!isDraft || isLocked} style={{ width: '100%' }}>
            <option value="iiit">iiit-only</option>
            <option value="open">open to all</option>
          </select>
        </div>
      </div>

      {/* Event tags - used for recommendations */}
      <div style={{ marginTop: 12 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>Event Tags (select relevant areas)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {AREAS.map(area => (
            <label key={area} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', padding: '6px 8px', borderRadius: 6, border: '1px solid #eee' }}>
              <input
                type="checkbox"
                checked={(event.event_tags || []).includes(area)}
                onChange={() => {
                  if (isLocked) return;
                  setEvent(prev => {
                    const curr = Array.isArray(prev.event_tags) ? [...prev.event_tags] : [];
                    const idx = curr.indexOf(area);
                    if (idx >= 0) curr.splice(idx, 1);
                    else curr.push(area);
                    return { ...prev, event_tags: curr };
                  });
                }}
                disabled={isLocked}
              />
              <span style={{ fontSize: 13 }}>{area}</span>
            </label>
          ))}
        </div>
        <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>These tags are used to recommend your event to participants with matching preferences.</div>
      </div>

      {/* Merchandise details: only for merchandise events */}
      {event.type === 'merchandise' && (
        <section style={{ marginTop: 16, padding: 12, border: '1px solid #ccc', borderRadius: 6, background: '#fafafa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Merchandise Items</h3>
            <button onClick={addItem} disabled={isLocked}>+ Add Item</button>
          </div>
          <div>
            {(event.merchandise || []).map((item, idx) => (
              <div key={idx} style={{ border: '1px solid #ddd', padding: 10, marginBottom: 10, borderRadius: 4, background: '#fff' }}>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 4 }}>Item Name *</label>
                  <input
                    value={item.itemName || ''}
                    onChange={e => updateItem(idx, { itemName: e.target.value })}
                    disabled={isLocked}
                    style={{ width: '100%' }}
                    placeholder="e.g., T-Shirt"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12 }}>Sizes (comma-separated)</label>
                    <input
                      value={item.sizesText || ''}
                      onChange={e => updateItem(idx, { sizesText: e.target.value })}
                      disabled={isLocked}
                      placeholder="S, M, L, XL"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12 }}>Colors (comma-separated)</label>
                    <input
                      value={item.colorsText || ''}
                      onChange={e => updateItem(idx, { colorsText: e.target.value })}
                      disabled={isLocked}
                      placeholder="Red, Blue, Black"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12 }}>Variants (comma-separated)</label>
                    <input
                      value={item.variantsText || ''}
                      onChange={e => updateItem(idx, { variantsText: e.target.value })}
                      disabled={isLocked}
                      placeholder="V1, V2"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 12 }}>Stock Quantity</label>
                    <input
                      type="number"
                      value={item.stockQuantity || 0}
                      onChange={e => updateItem(idx, { stockQuantity: Number(e.target.value) })}
                      disabled={isLocked}
                      min="0"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 12 }}>Purchase Limit per Participant</label>
                    <input
                      type="number"
                      value={item.purchaseLimitPerParticipant || 1}
                      onChange={e => updateItem(idx, { purchaseLimitPerParticipant: Number(e.target.value) })}
                      disabled={isLocked}
                      min="0"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
                <button onClick={() => removeItem(idx)} disabled={isLocked} style={{ marginTop: 4 }}>
                  Remove Item
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Form Builder: only shown for 'normal' events */}
      {event.type === 'normal' && (
        <section style={{ marginTop: 16 }}>
          <h3>Form Builder {disabledFormBuilder ? '(locked)' : ''}</h3>
          {!disabledFormBuilder && <button onClick={addField}>Add Field</button>}
          <div style={{ marginTop: 8 }}>
            {(event.formFields||[]).map((f,i) => (
              <FieldEditor
                key={f.name||i}
                field={f}
                index={i}
                onChange={updateField}
                onMoveUp={()=>moveField(i,i-1)}
                onMoveDown={()=>moveField(i,i+1)}
                onRemove={()=>removeField(i)}
                disabled={disabledFormBuilder}
                isLast={i === (event.formFields||[]).length - 1}
              />
            ))}
          </div>

          {/* Preview */}
          {(event.formFields||[]).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h4>Preview</h4>
              <form>
                {(event.formFields||[]).sort((a,b)=>a.position-b.position).map((f) => {
                  const choices = f.choicesText
                    ? f.choicesText.split(',').map(s=>s.trim()).filter(Boolean)
                    : (f.choices || []);
                  return (
                    <div key={f.name} style={{ marginBottom: 8 }}>
                      <label>{f.title}{f.required ? ' *' : ''}</label>
                      {f.type === 'text' && <input style={{ width: '100%' }} />}
                      {f.type === 'number' && <input type="number" style={{ width: '100%' }} />}
                      {f.type === 'dropdown' && (
                        <select style={{ width: '100%' }}>{choices.map(c => <option key={c}>{c}</option>)}</select>
                      )}
                      {f.type === 'checkbox' && choices.map(c => (
                        <div key={c}><label><input type="checkbox" /> {c}</label></div>
                      ))}
                      {f.type === 'file' && <input type="file" />}
                    </div>
                  );
                })}
              </form>
            </div>
          )}
        </section>
      )}

      {/* Actions */}
      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {isDraft && (
          <>
            <button onClick={saveDraft} disabled={loading}>{editingId ? 'Save Draft' : 'Create Draft'}</button>
            <button onClick={publish} disabled={loading}>Publish Event</button>
          </>
        )}
        {isPublished && (
          <>
            <button onClick={savePublishedEdits} disabled={loading}>Save Changes</button>
            <button onClick={() => changeStatus('closed')} disabled={loading}>Close Registrations</button>
          </>
        )}
      </div>

      {/* Status notes */}
      {isPublished && (
        <div style={{ marginTop: 12, fontSize: 13, color: '#666' }}>
          <strong>Published event:</strong> Only description, deadline (extend), and limit (increase) can be edited.
        </div>
      )}
    </div>
  );
}