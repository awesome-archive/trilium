"use strict";

const Note = require('./entities/note');
const Branch = require('./entities/branch');
const Attribute = require('./entities/attribute');

class NoteCache {
    constructor() {
        this.reset();
    }

    reset() {
        /** @type {Object.<String, Note>} */
        this.notes = [];
        /** @type {Object.<String, Branch>} */
        this.branches = [];
        /** @type {Object.<String, Branch>} */
        this.childParentToBranch = {};
        /** @type {Object.<String, Attribute>} */
        this.attributes = [];
        /** @type {Object.<String, Attribute[]>} Points from attribute type-name to list of attributes them */
        this.attributeIndex = {};

        this.loaded = false;
    }

    /** @return {Attribute[]} */
    findAttributes(type, name) {
        return this.attributeIndex[`${type}-${name}`] || [];
    }

    /** @return {Attribute[]} */
    findAttributesWithPrefix(type, name) {
        const resArr = [];
        const key = `${type}-${name}`;

        for (const idx in this.attributeIndex) {
            if (idx.startsWith(key)) {
                resArr.push(this.attributeIndex[idx]);
            }
        }

        return resArr.flat();
    }

    decryptProtectedNotes() {
        for (const note of Object.values(this.notes)) {
            note.decrypt();
        }
    }

    getBranch(childNoteId, parentNoteId) {
        return this.childParentToBranch[`${childNoteId}-${parentNoteId}`];
    }
}

const noteCache = new NoteCache();

module.exports = noteCache;
