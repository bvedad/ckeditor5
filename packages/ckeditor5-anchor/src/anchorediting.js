/**
 * @license Copyright (c) 2003-2020, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module anchor/anchorediting
 */

import Plugin from '@ckeditor/ckeditor5-core/src/plugin';
import AnchorCommand from './anchorcommand';
import UnanchorCommand from './unanchorcommand';
import { createAnchorElement } from './utils';
import bindTwoStepCaretToAttribute from '@ckeditor/ckeditor5-engine/src/utils/bindtwostepcarettoattribute';
import findAnchorRange from './findanchorrange';
import '../theme/anchor.css';

const HIGHLIGHT_CLASS = 'ck-anchor_selected';

/**
 * The anchor engine feature.
 *
 * It introduces the `anchorHref="url"` attribute in the model which renders to the view as a `<a href="url">` element
 * as well as `'anchor'` and `'unanchor'` commands.
 *
 * @extends module:core/plugin~Plugin
 */
export default class AnchorEditing extends Plugin {
	/**
	 * @inheritDoc
	 */
	static get pluginName() {
		return 'AnchorEditing';
	}

	/**
	 * @inheritDoc
	 */
	constructor( editor ) {
		super( editor );

		editor.config.define( 'anchor', {
			addTargetToExternalAnchors: false
		} );
	}

	/**
	 * @inheritDoc
	 */
	init() {
		const editor = this.editor;
		const locale = editor.locale;

		// Allow anchor attribute on all inline nodes.
		editor.model.schema.extend( '$text', { allowAttributes: 'anchorHref' } );

		editor.conversion.for( 'dataDowncast' )
			.attributeToElement( { model: 'anchorHref', view: createAnchorElement } );

		editor.conversion.for( 'editingDowncast' )
			.attributeToElement( { model: 'anchorHref', view: ( href, writer ) => {
				return createAnchorElement(href, writer );
			} } );

		editor.conversion.for( 'upcast' )
			.elementToAttribute( {
				view: {
					name: 'a',
					attributes: {
						href: true
					}
				},
				model: {
					key: 'anchorHref',
					value: viewElement => viewElement.getAttribute( 'href' )
				}
			} );

		// Create anchoring commands.
		editor.commands.add( 'anchor', new AnchorCommand( editor ) );
		editor.commands.add( 'unanchor', new UnanchorCommand( editor ) );

		// Enable two-step caret movement for `anchorHref` attribute.
		bindTwoStepCaretToAttribute( {
			view: editor.editing.view,
			model: editor.model,
			emitter: this,
			attribute: 'anchorHref',
			locale
		} );

		// Setup highlight over selected anchor.
		this._setupAnchorHighlight();

		// Change the attributes of the selection in certain situations after the anchor was inserted into the document.
		this._enableInsertContentSelectionAttributesFixer();
	}

	/**
	 * Adds a visual highlight style to a anchor in which the selection is anchored.
	 * Together with two-step caret movement, they indicate that the user is typing inside the anchor.
	 *
	 * Highlight is turned on by adding the `.ck-anchor_selected` class to the anchor in the view:
	 *
	 * * The class is removed before the conversion has started, as callbacks added with the `'highest'` priority
	 * to {@anchor module:engine/conversion/downcastdispatcher~DowncastDispatcher} events.
	 * * The class is added in the view post fixer, after other changes in the model tree were converted to the view.
	 *
	 * This way, adding and removing the highlight does not interfere with conversion.
	 *
	 * @private
	 */
	_setupAnchorHighlight() {
		const editor = this.editor;
		const view = editor.editing.view;
		const highlightedAnchors = new Set();

		// Adding the class.
		view.document.registerPostFixer( writer => {
			const selection = editor.model.document.selection;
			let changed = false;

			if ( selection.hasAttribute( 'anchorHref' ) ) {
				const modelRange = findAnchorRange( selection.getFirstPosition(), selection.getAttribute( 'anchorHref' ), editor.model );
				const viewRange = editor.editing.mapper.toViewRange( modelRange );

				// There might be multiple `a` elements in the `viewRange`, for example, when the `a` element is
				// broken by a UIElement.
				for ( const item of viewRange.getItems() ) {
					if ( item.is( 'a' ) && !item.hasClass( HIGHLIGHT_CLASS ) ) {
						writer.addClass( HIGHLIGHT_CLASS, item );
						highlightedAnchors.add( item );
						changed = true;
					}
				}
			}

			return changed;
		} );

		// Removing the class.
		editor.conversion.for( 'editingDowncast' ).add( dispatcher => {
			// Make sure the highlight is removed on every possible event, before conversion is started.
			dispatcher.on( 'insert', removeHighlight, { priority: 'highest' } );
			dispatcher.on( 'remove', removeHighlight, { priority: 'highest' } );
			dispatcher.on( 'attribute', removeHighlight, { priority: 'highest' } );
			dispatcher.on( 'selection', removeHighlight, { priority: 'highest' } );

			function removeHighlight() {
				view.change( writer => {
					for ( const item of highlightedAnchors.values() ) {
						writer.removeClass( HIGHLIGHT_CLASS, item );
						highlightedAnchors.delete( item );
					}
				} );
			}
		} );
	}

	/**
	 * Starts listening to {@anchor module:engine/model/model~Model#event:insertContent} and corrects the model
	 * selection attributes if the selection is at the end of a anchor after inserting the content.
	 *
	 * The purpose of this action is to improve the overall UX because the user is no longer "trapped" by the
	 * `anchorHref` attribute of the selection and they can type a "clean" (`anchorHref`–less) text right away.
	 *
	 * See https://github.com/ckeditor/ckeditor5/issues/6053.
	 *
	 * @private
	 */
	_enableInsertContentSelectionAttributesFixer() {
		const editor = this.editor;
		const model = editor.model;
		const selection = model.document.selection;

		model.on( 'insertContent', () => {
			const nodeBefore = selection.anchor.nodeBefore;
			const nodeAfter = selection.anchor.nodeAfter;

			// NOTE: ↰ and ↱ represent the gravity of the selection.

			// The only truly valid case is:
			//
			//		                                 ↰
			//		...<$text anchorHref="foo">INSERTED[]</$text>
			//
			// If the selection is not "trapped" by the `anchorHref` attribute after inserting, there's nothing
			// to fix there.
			if ( !selection.hasAttribute( 'anchorHref' ) ) {
				return;
			}

			// Filter out the following case where a anchor with the same href (e.g. <a href="foo">INSERTED</a>) is inserted
			// in the middle of an existing anchor:
			//
			// Before insertion:
			//		                       ↰
			//		<$text anchorHref="foo">l[]ink</$text>
			//
			// Expected after insertion:
			//		                               ↰
			//		<$text anchorHref="foo">lINSERTED[]ink</$text>
			//
			if ( !nodeBefore ) {
				return;
			}

			// Filter out the following case where the selection has the "anchorHref" attribute because the
			// gravity is overridden and some text with another attribute (e.g. <b>INSERTED</b>) is inserted:
			//
			// Before insertion:
			//
			//		                       ↱
			//		<$text anchorHref="foo">[]anchor</$text>
			//
			// Expected after insertion:
			//
			//		                                                          ↱
			//		<$text bold="true">INSERTED</$text><$text anchorHref="foo">[]anchor</$text>
			//
			if ( !nodeBefore.hasAttribute( 'anchorHref' ) ) {
				return;
			}

			// Filter out the following case where a anchor is a inserted in the middle (or before) another anchor
			// (different URLs, so they will not merge). In this (let's say weird) case, we can leave the selection
			// attributes as they are because the user will end up writing in one anchor or another anyway.
			//
			// Before insertion:
			//
			//		                       ↰
			//		<$text anchorHref="foo">l[]ink</$text>
			//
			// Expected after insertion:
			//
			//		                                                             ↰
			//		<$text anchorHref="foo">l</$text><$text anchorHref="bar">INSERTED[]</$text><$text anchorHref="foo">ink</$text>
			//
			if ( nodeAfter && nodeAfter.hasAttribute( 'anchorHref' ) ) {
				return;
			}

			// Make the selection free of anchor-related model attributes.
			// All anchor-related model attributes start with "anchor". That includes not only "anchorHref"
			// but also all decorator attributes (they have dynamic names).
			model.change( writer => {
				[ ...model.document.selection.getAttributeKeys() ]
					.filter( name => name.startsWith( 'anchor' ) )
					.forEach( name => writer.removeSelectionAttribute( name ) );
			} );
		}, { priority: 'low' } );
	}
}
