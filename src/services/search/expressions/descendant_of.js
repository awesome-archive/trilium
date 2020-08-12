"use strict";

const Expression = require('./expression');
const NoteSet = require('../note_set');
const noteCache = require('../../note_cache/note_cache');

class DescendantOfExp extends Expression {
    constructor(subExpression) {
        super();

        this.subExpression = subExpression;
    }

    execute(inputNoteSet, searchContext) {
        const subInputNoteSet = new NoteSet(Object.values(noteCache.notes));
        const subResNoteSet = this.subExpression.execute(subInputNoteSet, searchContext);

        const subTreeNoteSet = new NoteSet();

        for (const note of subResNoteSet.notes) {
            subTreeNoteSet.addAll(note.subtreeNotes);
        }

        return inputNoteSet.intersection(subTreeNoteSet);
    }
}

module.exports = DescendantOfExp;
