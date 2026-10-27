"use client";

import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

export const boardStages = ["calificacion", "propuesta", "negociacion"] as const;
export type BoardStage = (typeof boardStages)[number];

export type BoardCard = {
  id: string;
  title: string;
  companyName: string | null;
  ownerName: string | null;
  amountCents: number;
  currency: string;
};

export type BoardColumns = Record<BoardStage, BoardCard[]>;

type MoveResult = { ok: true } | { ok: false; error: { message: string } };
type MoveAction = (input: {
  opportunityId: string;
  toStage: BoardStage;
  toPosition: number;
}) => Promise<MoveResult>;

const stageLabels: Record<BoardStage, string> = {
  calificacion: "Calificación",
  propuesta: "Propuesta",
  negociacion: "Negociación",
};

const amount = new Intl.NumberFormat("es-PE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(card: BoardCard): string {
  return `${card.currency === "USD" ? "US$" : "S/"} ${amount.format(card.amountCents / 100)}`;
}

function stageOf(columns: BoardColumns, id: string): BoardStage | undefined {
  return boardStages.find((stage) => columns[stage].some((card) => card.id === id));
}

function Card({
  card,
  stage,
  onMove,
}: {
  card: BoardCard;
  stage: BoardStage;
  onMove: (card: BoardCard, to: BoardStage) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });
  const index = boardStages.indexOf(stage);
  const previous = boardStages[index - 1];
  const next = boardStages[index + 1];
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      className={`rounded-[var(--radius-card)] border border-border bg-background p-3 ${
        isDragging ? "relative z-10 shadow-[0_10px_30px_rgb(18_20_23/0.18)]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link
            href={`/oportunidades/${card.id}`}
            className="font-medium text-link underline-offset-2 hover:underline"
          >
            {card.title}
          </Link>
          <p className="text-sm text-fg-muted">{card.companyName ?? "Sin empresa"}</p>
          <p className="text-sm tabular-nums">{formatMoney(card)}</p>
          <p className="text-sm text-fg-muted">{card.ownerName}</p>
        </div>
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Arrastrar ${card.title}`}
          className="min-h-9 cursor-grab rounded-[var(--radius-control)] px-2 text-fg-muted hover:bg-surface"
        >
          ⠿
        </button>
      </div>
      {/* Single-pointer and keyboard alternative to dragging (WCAG 2.5.7). */}
      <div className="mt-2 flex gap-2">
        {previous ? (
          <button
            type="button"
            onClick={() => onMove(card, previous)}
            aria-label={`Mover a la etapa anterior: ${card.title}`}
            className="min-h-9 rounded-[var(--radius-control)] border border-border px-2 text-sm hover:bg-surface"
          >
            ←
          </button>
        ) : null}
        {next ? (
          <button
            type="button"
            onClick={() => onMove(card, next)}
            aria-label={`Mover a la etapa siguiente: ${card.title}`}
            className="min-h-9 rounded-[var(--radius-control)] border border-border px-2 text-sm hover:bg-surface"
          >
            →
          </button>
        ) : null}
      </div>
    </li>
  );
}

function Column({
  stage,
  cards,
  onMove,
}: {
  stage: BoardStage;
  cards: BoardCard[];
  onMove: (card: BoardCard, to: BoardStage) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section
      aria-labelledby={`col-${stage}`}
      className={`rounded-[var(--radius-card)] border border-border p-3 ${isOver ? "bg-surface-accent" : "bg-surface"}`}
    >
      <h2 id={`col-${stage}`} className="mb-3 font-display font-semibold">
        {stageLabels[stage]} <span className="text-fg-muted tabular-nums">({cards.length})</span>
      </h2>
      <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="min-h-24 space-y-2">
          {cards.map((card) => (
            <Card key={card.id} card={card} stage={stage} onMove={onMove} />
          ))}
        </ul>
      </SortableContext>
    </section>
  );
}

export function PipelineBoard({
  columns,
  moveAction,
}: {
  columns: BoardColumns;
  moveAction: MoveAction;
}) {
  const [board, setBoard] = useState(columns);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Server props win after every revalidation.
  useEffect(() => setBoard(columns), [columns]);

  function commit(next: BoardColumns, card: BoardCard, to: BoardStage) {
    const previous = board;
    setBoard(next);
    setError(null);
    startTransition(async () => {
      const result = await moveAction({
        opportunityId: card.id,
        toStage: to,
        toPosition: next[to].findIndex((c) => c.id === card.id),
      });
      if (!result.ok) {
        setBoard(previous);
        setError(result.error.message);
      }
    });
  }

  function moveToEnd(card: BoardCard, to: BoardStage) {
    const from = stageOf(board, card.id);
    if (!from) return;
    const next = { ...board, [from]: board[from].filter((c) => c.id !== card.id) };
    next[to] = [...next[to], card];
    commit(next, card, to);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const id = String(active.id);
    const from = stageOf(board, id);
    const to = (boardStages as readonly string[]).includes(String(over.id))
      ? (over.id as BoardStage)
      : stageOf(board, String(over.id));
    if (!from || !to) return;
    const card = board[from].find((c) => c.id === id);
    if (!card) return;
    if (from === to) {
      const oldIndex = board[from].findIndex((c) => c.id === id);
      const newIndex = board[to].findIndex((c) => c.id === over.id);
      if (newIndex < 0 || oldIndex === newIndex) return;
      commit({ ...board, [to]: arrayMove(board[to], oldIndex, newIndex) }, card, to);
      return;
    }
    const target = board[to].filter((c) => c.id !== id);
    const overIndex = target.findIndex((c) => c.id === over.id);
    target.splice(overIndex < 0 ? target.length : overIndex, 0, card);
    commit({ ...board, [from]: board[from].filter((c) => c.id !== id), [to]: target }, card, to);
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <div className="grid gap-4 lg:grid-cols-3">
          {boardStages.map((stage) => (
            <Column key={stage} stage={stage} cards={board[stage]} onMove={moveToEnd} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
