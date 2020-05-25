/**
 * @license Copyright (c) 2003-2020, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module anchor/utils
 */

/**
 * Returns `true` if a given view node is the anchor element.
 *
 * @param {module:engine/view/node~Node} node
 * @returns {Boolean}
 */
export function isAnchorElement( node ) {
	return node.is( 'attributeElement' ) && !!node.getCustomProperty( 'anchor' );
}

/**
 * Creates anchor {@anchor module:engine/view/attributeelement~AttributeElement} with the provided `href` attribute.
 *
 * @param {String} href
 * @returns {module:engine/view/attributeelement~AttributeElement}
 */
export function createAnchorElement( name, writer ) {
	// Priority 5 - https://github.com/ckeditor/ckeditor5-anchor/issues/121.
	const anchorElement = writer.createAttributeElement( 'a', { name, id: name }, { priority: 5 } );
	writer.addClass("ck-anchor", anchorElement);
	writer.setCustomProperty( 'anchor', true, anchorElement );

	return anchorElement;
}
