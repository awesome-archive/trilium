"use strict";

const lex = require('./lex.js');
const handleParens = require('./handle_parens.js');
const parse = require('./parse.js');
const NoteSet = require("../note_set.js");
const SearchResult = require("../search_result.js");
const ParsingContext = require("../parsing_context.js");
const noteCache = require('../../note_cache/note_cache.js');
const noteCacheService = require('../../note_cache/note_cache_service.js');
const hoistedNoteService = require('../../hoisted_note.js');
const repository = require('../../repository.js');
const utils = require('../../utils.js');

/**
 * @param {Expression} expression
 * @return {Promise<SearchResult[]>}
 */
function findNotesWithExpression(expression) {
    const hoistedNote = noteCache.notes[hoistedNoteService.getHoistedNoteId()];
    const allNotes = (hoistedNote && hoistedNote.noteId !== 'root')
        ? hoistedNote.subtreeNotes
        : Object.values(noteCache.notes);

    const allNoteSet = new NoteSet(allNotes);

    const searchContext = {
        noteIdToNotePath: {}
    };

    const noteSet = expression.execute(allNoteSet, searchContext);

    let searchResults = noteSet.notes
        .map(note => searchContext.noteIdToNotePath[note.noteId] || noteCacheService.getSomePath(note))
        .filter(notePathArray => notePathArray.includes(hoistedNoteService.getHoistedNoteId()))
        .map(notePathArray => new SearchResult(notePathArray));

    if (!noteSet.sorted) {
        // sort results by depth of the note. This is based on the assumption that more important results
        // are closer to the note root.
        searchResults.sort((a, b) => {
            if (a.notePathArray.length === b.notePathArray.length) {
                return a.notePathTitle < b.notePathTitle ? -1 : 1;
            }

            return a.notePathArray.length < b.notePathArray.length ? -1 : 1;
        });
    }

    return searchResults;
}

function parseQueryToExpression(query, parsingContext) {
    const {fulltextTokens, expressionTokens} = lex(query);
    const structuredExpressionTokens = handleParens(expressionTokens);

    const expression = parse({
        fulltextTokens,
        expressionTokens: structuredExpressionTokens,
        parsingContext,
        originalQuery: query
    });

    return expression;
}

/**
 * @param {string} query
 * @param {ParsingContext} parsingContext
 * @return {Promise<SearchResult[]>}
 */
function findNotesWithQuery(query, parsingContext) {
    const expression = parseQueryToExpression(query, parsingContext);

    if (!expression) {
        return [];
    }

    return findNotesWithExpression(expression);
}

function searchNotes(query) {
    if (!query.trim().length) {
        return [];
    }

    const parsingContext = new ParsingContext({
        includeNoteContent: true,
        fuzzyAttributeSearch: false
    });

    return findNotesWithQuery(query, parsingContext);
}

function searchTrimmedNotes(query) {
    const allSearchResults = searchNotes(query);
    const trimmedSearchResults = allSearchResults.slice(0, 200);

    return {
        count: allSearchResults.length,
        results: trimmedSearchResults
    };
}

function searchNotesForAutocomplete(query) {
    if (!query.trim().length) {
        return [];
    }

    const parsingContext = new ParsingContext({
        includeNoteContent: false,
        fuzzyAttributeSearch: true
    });

    let searchResults = findNotesWithQuery(query, parsingContext);

    searchResults = searchResults.slice(0, 200);

    highlightSearchResults(searchResults, parsingContext.highlightedTokens);

    return searchResults.map(result => {
        return {
            notePath: result.notePath,
            notePathTitle: result.notePathTitle,
            highlightedNotePathTitle: result.highlightedNotePathTitle
        }
    });
}

function highlightSearchResults(searchResults, highlightedTokens) {
    // we remove < signs because they can cause trouble in matching and overwriting existing highlighted chunks
    // which would make the resulting HTML string invalid.
    // { and } are used for marking <b> and </b> tag (to avoid matches on single 'b' character)
    highlightedTokens = highlightedTokens.map(token => token.replace('/[<\{\}]/g', ''));

    // sort by the longest so we first highlight longest matches
    highlightedTokens.sort((a, b) => a.length > b.length ? -1 : 1);

    for (const result of searchResults) {
        const note = noteCache.notes[result.noteId];

        result.highlightedNotePathTitle = result.notePathTitle;

        for (const attr of note.attributes) {
            if (highlightedTokens.find(token => attr.name.includes(token) || attr.value.includes(token))) {
                result.highlightedNotePathTitle += ` <small>${formatAttribute(attr)}</small>`;
            }
        }
    }

    for (const token of highlightedTokens) {
        const tokenRegex = new RegExp("(" + utils.escapeRegExp(token) + ")", "gi");

        for (const result of searchResults) {
            result.highlightedNotePathTitle = result.highlightedNotePathTitle.replace(tokenRegex, "{$1}");
        }
    }

    for (const result of searchResults) {
        result.highlightedNotePathTitle = result.highlightedNotePathTitle
            .replace(/{/g, "<b>")
            .replace(/}/g, "</b>");
    }
}

function formatAttribute(attr) {
    if (attr.type === 'relation') {
        return '@' + utils.escapeHtml(attr.name) + "=…";
    }
    else if (attr.type === 'label') {
        let label = '#' + utils.escapeHtml(attr.name);

        if (attr.value) {
            const val = /[^\w_-]/.test(attr.value) ? '"' + attr.value + '"' : attr.value;

            label += '=' + utils.escapeHtml(val);
        }

        return label;
    }
}

function searchNoteEntities(query) {
    return searchNotes(query)
        .map(res => repository.getNote(res.noteId));
}

module.exports = {
    searchNotes,
    searchTrimmedNotes,
    searchNotesForAutocomplete,
    findNotesWithQuery,
    searchNoteEntities
};
