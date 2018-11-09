/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

/* global window */

import VirtualTestEditor from '@ckeditor/ckeditor5-core/tests/_utils/virtualtesteditor';
import { getData as getModelData, setData as setModelData } from '@ckeditor/ckeditor5-engine/src/dev-utils/model';
import testUtils from '@ckeditor/ckeditor5-core/tests/_utils/utils';
import CKEditorError from '@ckeditor/ckeditor5-utils/src/ckeditorerror';
import Paragraph from '@ckeditor/ckeditor5-paragraph/src/paragraph';
import ImageEditing from '@ckeditor/ckeditor5-image/src/image/imageediting';
import LinkEditing from '@ckeditor/ckeditor5-link/src/linkediting';
import Notification from '@ckeditor/ckeditor5-ui/src/notification/notification';
import { downcastElementToElement } from '@ckeditor/ckeditor5-engine/src/conversion/downcast-converters';

import CKFinderCommand from '../src/ckfindercommand';

describe( 'CKFinderCommand', () => {
	let editor, command, model;

	testUtils.createSinonSandbox();

	beforeEach( () => {
		return VirtualTestEditor
			.create( {
				plugins: [ Paragraph, ImageEditing, LinkEditing, Notification ]
			} )
			.then( newEditor => {
				editor = newEditor;
				model = editor.model;

				command = new CKFinderCommand( editor );

				const schema = model.schema;
				schema.extend( 'image' );

				setModelData( model, '<paragraph>f[o]o</paragraph>' );
			} );
	} );

	afterEach( () => {
		return editor.destroy();
	} );

	describe( 'isEnabled', () => {
		it( 'should be true when the selection directly in the root', () => {
			model.enqueueChange( 'transparent', () => {
				setModelData( model, '[]' );

				command.refresh();
				expect( command.isEnabled ).to.be.true;
			} );
		} );

		it( 'should be true when the selection is in empty block', () => {
			setModelData( model, '<paragraph>[]</paragraph>' );

			expect( command.isEnabled ).to.be.true;
		} );
	} );

	describe( 'execute()', () => {
		const finderMock = {
			on: ( eventName, callback ) => {
				finderMock[ eventName ] = callback;
			}
		};

		beforeEach( () => {
			window.CKFinder = {
				modal: config => {
					config.onInit( finderMock );
				},
				popup: config => {
					config.onInit( finderMock );
				}
			};
		} );

		it( 'should register proper listeners on CKFinder instance', () => {
			command.execute();

			expect( finderMock ).to.have.property( 'files:choose' );
			expect( finderMock ).to.have.property( 'file:choose:resizedImage' );
		} );

		it( 'should use "CKFinder.modal" as default CKFinder opener method', () => {
			const spy = sinon.spy( window.CKFinder, 'modal' );

			command.execute();

			sinon.assert.calledOnce( spy );
		} );

		it( 'should use "CKFinder.modal" as default CKFinder opener method', () => {
			const spy = sinon.spy( window.CKFinder, 'popup' );

			editor.config.set( 'ckfinder.openerMethod', 'popup' );

			command.execute();

			sinon.assert.calledOnce( spy );
		} );

		it( 'should throw if unsupported CKFinder opener method was set', () => {
			editor.config.set( 'ckfinder.openerMethod', 'foobar' );

			expect( () => {
				command.execute();
			} ).to.throw( CKEditorError, /ckfinder-unknown-openerMethod/ );
		} );

		it( 'should insert single chosen image as image widget', () => {
			const url = 'foo/bar.jpg';

			command.execute();

			mockFilesChooseEvent( [ mockFinderFile( url ) ] );

			expect( getModelData( model ) )
				.to.equal( `[<image src="${ url }"></image>]<paragraph>foo</paragraph>` );
		} );

		it( 'should insert link if chosen file is not an image', () => {
			const url = 'foo/bar.pdf';

			command.execute();

			mockFilesChooseEvent( [ mockFinderFile( url, false ) ] );

			expect( getModelData( model ) )
				.to.equal( `<paragraph>f[<$text linkHref="${ url }">o</$text>]o</paragraph>` );
		} );

		it( 'should pass CKFinder config options', () => {
			const spy = sinon.spy( window.CKFinder, 'modal' );

			const connectorPath = 'foo/bar.php';
			editor.config.set( 'ckfinder.config', { connectorPath } );

			command.execute();

			const openerMethodOptions = spy.args[ 0 ][ 0 ];

			expect( openerMethodOptions ).to.have.property( 'chooseFiles', true );
			expect( openerMethodOptions ).to.have.property( 'onInit' );
			expect( openerMethodOptions ).to.have.property( 'connectorPath', connectorPath );
		} );

		it( 'should insert multiple chosen images as image widget', () => {
			const url1 = 'foo/bar1.jpg';
			const url2 = 'foo/bar2.jpg';
			const url3 = 'foo/bar3.jpg';

			command.execute();

			mockFilesChooseEvent( [ mockFinderFile( url1 ), mockFinderFile( url2 ), mockFinderFile( url3 ) ] );

			expect( getModelData( model ) ).to.equal(
				`<image src="${ url1 }"></image><image src="${ url2 }"></image>[<image src="${ url3 }"></image>]<paragraph>foo</paragraph>`
			);
		} );

		it( 'should insert only images from chosen files', () => {
			const url1 = 'foo/bar1.jpg';
			const url2 = 'foo/bar2.pdf';
			const url3 = 'foo/bar3.jpg';

			command.execute();

			mockFilesChooseEvent( [ mockFinderFile( url1 ), mockFinderFile( url2, false ), mockFinderFile( url3 ) ] );

			expect( getModelData( model ) ).to.equal(
				`<image src="${ url1 }"></image>[<image src="${ url3 }"></image>]<paragraph>foo</paragraph>`
			);
		} );

		it( 'should use CKFinder Proxy for privately hosted files', () => {
			const proxyUrl = 'bar/foo.jpg';

			finderMock.request = () => proxyUrl;

			command.execute();

			mockFilesChooseEvent( [ mockFinderFile( false ) ] );

			expect( getModelData( model ) ).to.equal(
				`[<image src="${ proxyUrl }"></image>]<paragraph>foo</paragraph>`
			);
		} );

		it( 'should insert resized image as image widget', () => {
			const url = 'foo/bar.jpg';

			command.execute();

			mockFinderEvent( 'file:choose:resizedImage', { resizedUrl: url } );

			expect( getModelData( model ) )
				.to.equal( `[<image src="${ url }"></image>]<paragraph>foo</paragraph>` );
		} );

		it( 'should show warning notification if no resized image URL was returned', done => {
			const notification = editor.plugins.get( Notification );

			notification.on( 'show:warning', ( evt, data ) => {
				expect( data.message ).to.equal( 'Could not obtain resized image URL. Try different image or folder.' );
				expect( data.title ).to.equal( 'Selecting resized image failed' );
				evt.stop();

				done();
			}, { priority: 'high' } );

			command.execute();

			mockFinderEvent( 'file:choose:resizedImage', { resizedUrl: undefined } );

			expect( getModelData( model ) )
				.to.equal( '<paragraph>f[o]o</paragraph>' );
		} );

		it( 'should not insert image nor crash when image could not be inserted', () => {
			model.schema.register( 'other', {
				allowIn: '$root',
				isLimit: true
			} );
			model.schema.extend( '$text', { allowIn: 'other' } );

			editor.conversion.for( 'downcast' ).add( downcastElementToElement( { model: 'other', view: 'p' } ) );

			setModelData( model, '<other>[]</other>' );

			command.execute();

			mockFilesChooseEvent( [ mockFinderFile( 'foo/bar.jpg' ) ] );

			expect( getModelData( model ) ).to.equal( '<other>[]</other>' );
		} );

		function mockFinderFile( url = 'foo/bar.jpg', isImage = true ) {
			return {
				isImage: () => isImage,
				get: () => url
			};
		}

		function mockFinderEvent( eventName, data ) {
			finderMock[ eventName ]( { data } );
		}

		function mockFilesChooseEvent( files ) {
			const data = {
				files: {
					toArray: () => files
				}
			};

			mockFinderEvent( 'files:choose', data );
		}
	} );
} );
