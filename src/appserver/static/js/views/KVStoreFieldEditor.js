require.config({
    paths: {
        text: "../app/lookup_editor/js/lib/text",
        console: '../app/lookup_editor/js/lib/console',
        kv_store_field_view: '../app/lookup_editor/js/views/KVStoreFieldView'
    }
});

define([
    "underscore",
    "backbone",
    "splunkjs/mvc",
    "util/splunkd_utils",
    "jquery",
    "splunkjs/mvc/simplesplunkview",
    "kv_store_field_view",
    "text!../app/lookup_editor/js/templates/KVStoreFieldEditor.html",
    "css!../app/lookup_editor/css/KVStoreFieldEditor.css"
], function(
    _,
    Backbone,
    mvc,
    splunkd_utils,
    $,
    SimpleSplunkView,
    KVStoreFieldView,
    Template
){
    
	
    var KVStoreFieldEditor = SimpleSplunkView.extend({
        className: "KVStoreFieldEditor",
        
        defaults: {
        	
        },
        
        events: {
        	"click .add-additional-field" : "doAddField"
        },
        
        initialize: function() {
        	this.options = _.extend({}, this.defaults, this.options);
        	
        	this.field_views = [];
        	this.field_counter = 0;
        	
        	this.listenTo(Backbone, "kv_field:remove", this.removeField.bind(this));
        },
        
        /**
         * Make sure that the fields are valid. If this function returns a string, then the input is invalid. Otherwise, "true" will be returned.
         */
        validate: function(){
        	
        	// Make sure that a field is defined
        	for(var c = 0; c < this.field_views.length; c++){
        		if(this.field_views[c].hasFieldName()){
        			return true;
        		}
        	}
        	
        	return "At least one field needs to be defined";
        },
        
        /**
         * Add a new field view instance.
         */
        removeField: function(unique_identifier){
        	this.field_views = _.without(this.field_views, _.findWhere(this.field_views, {unique_identifier: unique_identifier}));
        },
        
        /**
         * Add a new field view instance.
         */
        doAddField: function(){
        	this.addFieldView('', 'string');
        },
        
        /**
         * Add an other field view widget.
         */
        addFieldView: function(field_name, field_type){
        	
        	// Make the placeholder for the view
        	var kv_store_field_view_selector = 'kv_store_field_' + this.field_counter;
        	
        	$('<div id="' + kv_store_field_view_selector + '"></div>').appendTo("#kv-store-fields");
        		
        	// Make the view instance
        	var kv_store_field_view = new KVStoreFieldView({
        		'el' : $('#' + kv_store_field_view_selector, this.$el),
        		'unique_identifier' : kv_store_field_view_selector
        	})
        	
        	// Add the view to the list
        	this.field_views.push(kv_store_field_view);
        	
        	// Render the added view
        	kv_store_field_view.render();
        	
        	// Increment the counter so that the next view has a different ID
        	this.field_counter++;
        	
        },
        
        /**
         * Modify the KV store collection schema
         */
        modifyKVStoreLookupSchema: function(namespace, lookup_file, owner, success_callback){
        	
        	// Set a default value for the owner and callback
        	if( typeof owner == 'undefined' ){
        		owner = 'nobody';
        	}
        	
        	if( typeof success_callback == 'undefined' ){
        		success_callback = null;
        	}
        	
        	// Make the data that will be posted to the server
        	var data = {};
        	
        	for(var c = 0; c < this.field_views.length; c++){
        		if(this.field_views[c].hasFieldName()){
        			data['field.' + this.field_views[c].getFieldName()] = this.field_views[c].getFieldType();
        		}
        	}
        	
        	// Perform the call
        	$.ajax({
        			url: splunkd_utils.fullpath(['/servicesNS', owner, namespace, 'storage/collections/config', lookup_file].join('/')),
        			data: data,
        			type: 'POST',
        			
        			// On success, populate the table
        			success: function(data) {
        				console.info('KV store lookup file created');
        			  
        				// Remember the specs on the created file
        				this.lookup = lookup_file;
        				this.namespace = namespace;
        				this.owner = owner;
        				this.lookup_type = "kv";
        				
        				// Run the success callback if one is defined
        				if(success_callback){
        					success_callback();
        				}
        				
        			  
        			}.bind(this),
        		  
        			// Handle cases where the file could not be found or the user did not have permissions
        			complete: function(jqXHR, textStatus){
        				if( jqXHR.status == 403){
        					console.info('Inadequate permissions');
        					this.showWarningMessage("You do not have permission to make a KV store collection", true);
        				}
        			  
        			}.bind(this),
        		  
        			// Handle errors
        			error: function(jqXHR, textStatus, errorThrown){
        				if( jqXHR.status != 403 ){
        					console.info('KV store collection creation failed');
        					this.showWarningMessage("The KV store collection could not be created", true);
        				}
        			}.bind(this)
        	});
        },
        
        render: function () {

        	// Render the base HTML
        	this.$el.html(_.template(Template, {
        		
        	}));
        	
        	var fields = {
        		'' : 'string'
        	};
        	
        	// Add an entry for each of the fields
        	for(field in fields){
        		this.addFieldView(field, fields[field]);
        	}
        	
        }
    });
    
    return KVStoreFieldEditor;
});