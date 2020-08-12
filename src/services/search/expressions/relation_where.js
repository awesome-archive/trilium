"use strict";

const Expression = require('./expression');
const NoteSet = require('../note_set');
const noteCache = require('../../note_cache/note_cache');

class RelationWhereExp extends Expression {
    constructor(relationName, subExpression) {
        super();

        this.relationName = relationName;
        this.subExpression = subExpression;
    }

    execute(inputNoteSet, searchContext) {
        const candidateNoteSet = new NoteSet();

        for (const attr of noteCache.findAttributes('relation', this.relationName)) {
            const note = attr.note;

            if (inputNoteSet.hasNoteId(note.noteId)) {
                const subInputNoteSet = new NoteSet([attr.targetNote]);
                const subResNoteSet = this.subExpression.execute(subInputNoteSet, searchContext);

                if (subResNoteSet.hasNote(attr.targetNote)) {
                    if (attr.isInheritable) {
                        candidateNoteSet.addAll(note.subtreeNotesIncludingTemplated);
                    } else if (note.isTemplate) {
                        candidateNoteSet.addAll(note.templatedNotes);
                    } else {
                        candidateNoteSet.add(note);
                    }
                }
            }
        }

        return candidateNoteSet.intersection(inputNoteSet);
    }
}

module.exports = RelationWhereExp;
