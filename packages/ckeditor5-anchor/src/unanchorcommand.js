/**
 * @license Copyright (c) 2003-2020, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module anchor/unanchorcommand
 */

import Command from '@ckeditor/ckeditor5-core/src/command';
import findAnchorRange from './findanchorrange';

/**
 * The unanchor command. It is used by the {@anchor module:anchor/anchor~Anchor anchor plugin}.
 *
 * @extends module:core/command~Command
 */
export default class UnanchorCommand extends Command {
	/**
	 * @inheritDoc
	 */
	refresh() {
		this.isEnabled = this.editor.model.document.selection.hasAttribute( 'anchorHref' );
	}

	/**
	 * Executes the command.
	 *
	 * When the selection is collapsed, it removes the `anchorHref` attribute from each node with the same `anchorHref` attribute value.
	 * When the selection is non-collapsed, it removes the `anchorHref` attribute from each node in selected ranges.
	 *
	 * # Decorators
	 *
	 * If {@anchor module:anchor/anchor~AnchorConfig#decorators `config.anchor.decorators`} is specified,
	 * all configured decorators are removed together with the `anchorHref` attribute.
	 *
	 * @fires execute
	 */
	execute() {
		const editor = this.editor;
		const model = this.editor.model;
		const selection = model.document.selection;
		const anchorCommand = editor.commands.get( 'anchor' );

		model.change( writer => {
			// Get ranges to unanchor.
			const rangesToUnanchor = selection.isCollapsed ?
				[ findAnchorRange( selection.getFirstPosition(), selection.getAttribute( 'anchorHref' ), model ) ] : selection.getRanges();

			// Remove `anchorHref` attribute from specified ranges.
			for ( const range of rangesToUnanchor ) {
				writer.removeAttribute( 'anchorHref', range );
				// If there are registered custom attributes, then remove them during unanchor.
				if ( anchorCommand ) {
					for ( const manualDecorator of anchorCommand.manualDecorators ) {
						writer.removeAttribute( manualDecorator.id, range );
					}
				}
			}
		} );
	}
}
