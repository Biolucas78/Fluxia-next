'use client';

import React, { useState } from 'react';
import { Lead, UserRole } from '@/lib/types';
import LeadCard from './LeadCard';
import LeadDetailsModal from './LeadDetailsModal';
import { 
  DndContext, 
  closestCorners, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  useDroppable
} from '@dnd-kit/core';
import { 
  SortableContext, 
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface CRMKanbanProps {
  leads: Lead[];
  columns: { id: string; title: string }[];
  onUpdateLead: (leadId: string, updates: Partial<Lead>) => void;
  onMoveLead: (lead: Lead, direction: 'next' | 'prev') => void;
  onDeleteLead: (leadId: string) => void;
  readOnly?: boolean;
  canDelete?: boolean;
  role?: UserRole;
}

function SortableLeadCard({ lead, onClick, onUpdateLead, onMoveLead, onDeleteLead, disabled, canDelete, role }: { key?: React.Key; lead: Lead; onClick: () => void; onUpdateLead: (leadId: string, updates: Partial<Lead>) => void; onMoveLead: (lead: Lead, direction: 'next' | 'prev') => void; onDeleteLead: (leadId: string) => void; disabled?: boolean; canDelete?: boolean; role?: UserRole; }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: lead.id,
    disabled,
    data: {
      type: 'Lead',
      lead,
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="mb-3">
      <LeadCard 
        lead={lead} 
        onClick={onClick} 
        onUpdateLead={onUpdateLead} 
        onMoveLead={onMoveLead} 
        onDeleteLead={onDeleteLead} 
        canDelete={canDelete}
        role={role}
      />
    </div>
  );
}

function KanbanColumn({ id, title, leads, onLeadClick, onUpdateLead, onMoveLead, onDeleteLead, readOnly, canDelete, role }: { key?: React.Key; id: string; title: string; leads: Lead[]; onLeadClick: (lead: Lead) => void; onUpdateLead: (leadId: string, updates: Partial<Lead>) => void; onMoveLead: (lead: Lead, direction: 'next' | 'prev') => void; onDeleteLead: (leadId: string) => void; readOnly?: boolean; canDelete?: boolean; role?: UserRole; }) {
  const { setNodeRef } = useDroppable({
    id,
    disabled: readOnly,
    data: {
      type: 'Column',
      columnId: id,
    },
  });

  return (
    <div ref={setNodeRef} className="w-72 flex flex-col gap-4 h-full shrink-0">
      <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">{title}</h3>
          <span className="bg-slate-100 dark:bg-slate-800 text-[10px] px-2 py-0.5 rounded-full font-bold text-slate-500">
            {leads.length}
          </span>
        </div>
      </div>

      <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-2 overflow-y-auto custom-scrollbar border border-slate-200/50 dark:border-slate-800/50 min-h-[150px]">
          {leads.map(lead => (
            <SortableLeadCard 
              key={lead.id} 
              lead={lead} 
              onClick={() => onLeadClick(lead)} 
              onUpdateLead={onUpdateLead} 
              onMoveLead={onMoveLead} 
              onDeleteLead={onDeleteLead} 
              disabled={readOnly}
              canDelete={canDelete}
              role={role}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export default function CRMKanban({ leads, columns, onUpdateLead, onMoveLead, onDeleteLead, readOnly, canDelete, role }: CRMKanbanProps) {
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: any) => {
    const { active } = event;
    setActiveLead(active.data.current?.lead);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const lead = active.data.current?.lead;
    if (!lead) return;

    const overData = over.data.current;
    let overColumnId: string | null = null;

    if (overData?.type === 'Column') {
      overColumnId = overData.columnId;
    } else if (overData?.type === 'Lead') {
      overColumnId = overData.lead.status;
    }

    if (overColumnId && lead.status !== overColumnId) {
      onUpdateLead(lead.id, { status: overColumnId });
    }
  };

  const handleDragEnd = () => {
    setActiveLead(null);
  };

  const handleNextLead = () => {
    if (!selectedLead) return;
    const columnLeads = leads.filter(l => l.status === selectedLead.status);
    const currentIndex = columnLeads.findIndex(l => l.id === selectedLead.id);
    if (currentIndex >= 0 && currentIndex < columnLeads.length - 1) {
      setSelectedLead(columnLeads[currentIndex + 1]);
    }
  };

  const hasNextLead = () => {
    if (!selectedLead) return false;
    const columnLeads = leads.filter(l => l.status === selectedLead.status);
    const currentIndex = columnLeads.findIndex(l => l.id === selectedLead.id);
    return currentIndex >= 0 && currentIndex < columnLeads.length - 1;
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex-1 w-full overflow-x-auto custom-scrollbar">
        <div className="flex gap-4 h-full min-w-max pb-4">
          {columns.map(column => (
            <KanbanColumn 
              key={column.id}
              id={column.id}
              title={column.title}
              leads={leads.filter(l => l.status === column.id)}
              onLeadClick={setSelectedLead}
              onUpdateLead={onUpdateLead}
              onMoveLead={onMoveLead}
              onDeleteLead={onDeleteLead}
              readOnly={readOnly}
              canDelete={canDelete}
              role={role}
            />
          ))}
        </div>
      </div>

      <DragOverlay adjustScale={false}>
        {activeLead ? (
          <div className="w-72 opacity-80 rotate-3 cursor-grabbing">
            <LeadCard lead={activeLead} onClick={() => {}} role={role} canDelete={canDelete} />
          </div>
        ) : null}
      </DragOverlay>

      {selectedLead && (
        <LeadDetailsModal 
          lead={leads.find(l => l.id === selectedLead.id) || selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdate={onUpdateLead}
          canEdit={!readOnly}
          role={role}
          onNextLead={handleNextLead}
          hasNextLead={hasNextLead()}
        />
      )}
    </DndContext>
  );
}
