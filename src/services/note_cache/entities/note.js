"use strict";

const protectedSessionService = require('../../protected_session');

class Note {
    constructor(noteCache, row) {
        /** @param {NoteCache} */
        this.noteCache = noteCache;
        /** @param {string} */
        this.noteId = row.noteId;
        /** @param {string} */
        this.title = row.title;
        /** @param {string} */
        this.type = row.type;
        /** @param {string} */
        this.mime = row.mime;
        /** @param {number} */
        this.contentLength = row.contentLength;
        /** @param {string} */
        this.dateCreated = row.dateCreated;
        /** @param {string} */
        this.dateModified = row.dateModified;
        /** @param {string} */
        this.utcDateCreated = row.utcDateCreated;
        /** @param {string} */
        this.utcDateModified = row.utcDateModified;
        /** @param {boolean} */
        this.isProtected = !!row.isProtected;
        /** @param {boolean} */
        this.isDecrypted = !row.isProtected || !!row.isContentAvailable;
        /** @param {Branch[]} */
        this.parentBranches = [];
        /** @param {Note[]} */
        this.parents = [];
        /** @param {Note[]} */
        this.children = [];
        /** @param {Attribute[]} */
        this.ownedAttributes = [];

        /** @param {Attribute[]|null} */
        this.attributeCache = null;
        /** @param {Attribute[]|null} */
        this.inheritableAttributeCache = null;

        /** @param {Attribute[]} */
        this.targetRelations = [];

        /** @param {string|null} */
        this.flatTextCache = null;

        this.noteCache.notes[this.noteId] = this;

        if (protectedSessionService.isProtectedSessionAvailable()) {
            this.decrypt();
        }

        /** @param {Note[]|null} */
        this.ancestorCache = null;
    }

    /** @return {Attribute[]} */
    get attributes() {
        return this.__getAttributes([]);
    }

    __getAttributes(path) {
        if (path.includes(this.noteId)) {
            return [];
        }

        if (!this.attributeCache) {
            const parentAttributes = this.ownedAttributes.slice();
            const newPath = [...path, this.noteId];

            if (this.noteId !== 'root') {
                for (const parentNote of this.parents) {
                    parentAttributes.push(...parentNote.__getInheritableAttributes(newPath));
                }
            }

            const templateAttributes = [];

            for (const ownedAttr of parentAttributes) { // parentAttributes so we process also inherited templates
                if (ownedAttr.type === 'relation' && ownedAttr.name === 'template') {
                    const templateNote = this.noteCache.notes[ownedAttr.value];

                    if (templateNote) {
                        templateAttributes.push(...templateNote.__getAttributes(newPath));
                    }
                }
            }

            this.attributeCache = parentAttributes.concat(templateAttributes);
            this.inheritableAttributeCache = [];

            for (const attr of this.attributeCache) {
                if (attr.isInheritable) {
                    this.inheritableAttributeCache.push(attr);
                }
            }
        }

        return this.attributeCache;
    }

    /** @return {Attribute[]} */
    __getInheritableAttributes(path) {
        if (path.includes(this.noteId)) {
            return [];
        }

        if (!this.inheritableAttributeCache) {
            this.__getAttributes(path); // will refresh also this.inheritableAttributeCache
        }

        return this.inheritableAttributeCache;
    }

    hasAttribute(type, name) {
        return this.attributes.find(attr => attr.type === type && attr.name === name);
    }

    getLabelValue(name) {
        const label = this.attributes.find(attr => attr.type === 'label' && attr.name === name);

        return label ? label.value : null;
    }

    getRelationTarget(name) {
        const relation = this.attributes.find(attr => attr.type === 'relation' && attr.name === name);

        return relation ? relation.targetNote : null;
    }

    get isArchived() {
        return this.hasAttribute('label', 'archived');
    }

    get isHideInAutocompleteOrArchived() {
        return this.attributes.find(attr =>
            attr.type === 'label'
            && ["archived", "hideInAutocomplete"].includes(attr.name));
    }

    get hasInheritableOwnedArchivedLabel() {
        return !!this.ownedAttributes.find(attr => attr.type === 'label' && attr.name === 'archived' && attr.isInheritable);
    }

    // will sort the parents so that non-archived are first and archived at the end
    // this is done so that non-archived paths are always explored as first when searching for note path
    resortParents() {
        this.parents.sort((a, b) => a.hasInheritableOwnedArchivedLabel ? 1 : -1);
    }

    /**
     * @return {string} - returns flattened textual representation of note, prefixes and attributes usable for searching
     */
    get flatText() {
        if (!this.flatTextCache) {
            if (this.isHideInAutocompleteOrArchived) {
                this.flatTextCache = " "; // can't be empty
                return this.flatTextCache;
            }

            this.flatTextCache = this.noteId + ' ';

            for (const branch of this.parentBranches) {
                if (branch.prefix) {
                    this.flatTextCache += branch.prefix + ' - ';
                }
            }

            this.flatTextCache += this.title + ' ';

            for (const attr of this.attributes) {
                // it's best to use space as separator since spaces are filtered from the search string by the tokenization into words
                this.flatTextCache += ' ' + (attr.type === 'label' ? '#' : '@') + attr.name;

                if (attr.value) {
                    this.flatTextCache += '=' + attr.value;
                }
            }

            this.flatTextCache = this.flatTextCache.toLowerCase();

            console.log(this.flatTextCache);
        }

        return this.flatTextCache;
    }

    invalidateThisCache() {
        this.flatTextCache = null;

        this.attributeCache = null;
        this.inheritableAttributeCache = null;
        this.ancestorCache = null;
    }

    invalidateSubtreeCaches() {
        this.invalidateThisCache();

        for (const childNote of this.children) {
            childNote.invalidateSubtreeCaches();
        }

        for (const targetRelation of this.targetRelations) {
            if (targetRelation.name === 'template') {
                const note = targetRelation.note;

                if (note) {
                    note.invalidateSubtreeCaches();
                }
            }
        }
    }

    invalidateSubtreeFlatText() {
        this.flatTextCache = null;

        for (const childNote of this.children) {
            childNote.invalidateSubtreeFlatText();
        }

        for (const targetRelation of this.targetRelations) {
            if (targetRelation.name === 'template') {
                const note = targetRelation.note;

                if (note) {
                    note.invalidateSubtreeFlatText();
                }
            }
        }
    }

    get isTemplate() {
        return !!this.targetRelations.find(rel => rel.name === 'template');
    }

    /** @return {Note[]} */
    get subtreeNotesIncludingTemplated() {
        const arr = [[this]];

        for (const childNote of this.children) {
            arr.push(childNote.subtreeNotesIncludingTemplated);
        }

        for (const targetRelation of this.targetRelations) {
            if (targetRelation.name === 'template') {
                const note = targetRelation.note;

                if (note) {
                    arr.push(note.subtreeNotesIncludingTemplated);
                }
            }
        }

        return arr.flat();
    }

    /** @return {Note[]} */
    get subtreeNotes() {
        const arr = [[this]];

        for (const childNote of this.children) {
            arr.push(childNote.subtreeNotes);
        }

        return arr.flat();
    }

    get parentCount() {
        return this.parents.length;
    }

    get childrenCount() {
        return this.children.length;
    }

    get labelCount() {
        return this.attributes.filter(attr => attr.type === 'label').length;
    }

    get relationCount() {
        return this.attributes.filter(attr => attr.type === 'relation').length;
    }

    get attributeCount() {
        return this.attributes.length;
    }

    get ancestors() {
        if (!this.ancestorCache) {
            const noteIds = new Set();
            this.ancestorCache = [];

            for (const parent of this.parents) {
                if (!noteIds.has(parent.noteId)) {
                    this.ancestorCache.push(parent);
                    noteIds.add(parent.noteId);
                }

                for (const ancestorNote of parent.ancestors) {
                    if (!noteIds.has(ancestorNote.noteId)) {
                        this.ancestorCache.push(ancestorNote);
                        noteIds.add(ancestorNote.noteId);
                    }
                }
            }
        }

        return this.ancestorCache;
    }

    /** @return {Note[]} - returns only notes which are templated, does not include their subtrees
     *                     in effect returns notes which are influenced by note's non-inheritable attributes */
    get templatedNotes() {
        const arr = [this];

        for (const targetRelation of this.targetRelations) {
            if (targetRelation.name === 'template') {
                const note = targetRelation.note;

                if (note) {
                    arr.push(note);
                }
            }
        }

        return arr;
    }

    decrypt() {
        if (this.isProtected && !this.isDecrypted && protectedSessionService.isProtectedSessionAvailable()) {
            this.title = protectedSessionService.decryptString(note.title);

            this.isDecrypted = true;
        }
    }
}

module.exports = Note;
