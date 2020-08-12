"use strict";

/**
 * Missing things from the OLD search:
 * - orderBy
 * - limit
 * - in - replaced with note.ancestors
 * - content in attribute search
 * - not - pherhaps not necessary
 *
 * other potential additions:
 * - targetRelations - either named or not
 * - any relation without name
 */

const repository = require('./repository');
const sql = require('./sql');
const log = require('./log');
const parseFilters = require('./search/parse_filters.js');
const buildSearchQuery = require('./build_search_query');
const noteCacheService = require('./note_cache/note_cache_service');

function searchForNotes(searchString) {
    const noteIds = searchForNoteIds(searchString);

    return repository.getNotes(noteIds);
}

function searchForNoteIds(searchString) {
    const filters = parseFilters(searchString);

    const {query, params} = buildSearchQuery(filters, 'notes.noteId');

    try {
        let noteIds = sql.getColumn(query, params);

        noteIds = noteIds.filter(noteCacheService.isAvailable);

        const isArchivedFilter = filters.find(filter => filter.name.toLowerCase() === 'isarchived');

        if (isArchivedFilter) {
            if (isArchivedFilter.operator === 'exists') {
                noteIds = noteIds.filter(noteCacheService.isArchived);
            }
            else if (isArchivedFilter.operator === 'not-exists') {
                noteIds = noteIds.filter(noteId => !noteCacheService.isArchived(noteId));
            }
            else {
                throw new Error(`Unrecognized isArchived operator ${isArchivedFilter.operator}`);
            }
        }

        const isInFilters = filters.filter(filter => filter.name.toLowerCase() === 'in');

        for (const isInFilter of isInFilters) {
            if (isInFilter.operator === '=') {
                noteIds = noteIds.filter(noteId => noteCacheService.isInAncestor(noteId, isInFilter.value));
            }
            else if (isInFilter.operator === '!=') {
                noteIds = noteIds.filter(noteId => !noteCacheService.isInAncestor(noteId, isInFilter.value));
            }
            else {
                throw new Error(`Unrecognized isIn operator ${isInFilter.operator}`);
            }
        }

        const limitFilter = filters.find(filter => filter.name.toLowerCase() === 'limit');

        if (limitFilter) {
            const limit = parseInt(limitFilter.value);

            return noteIds.splice(0, limit);
        }
        else {
            return noteIds;
        }

    }
    catch (e) {
        log.error("Search failed for " + query);

        throw e;
    }
}

module.exports = {
    searchForNotes,
    searchForNoteIds
};
