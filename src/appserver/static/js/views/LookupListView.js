
require.config({
    paths: {
        datatables: "../app/lookup_editor/js/lib/DataTables/js/jquery.dataTables",
        bootstrapDataTables: "../app/lookup_editor/js/lib/DataTables/js/dataTables.bootstrap",
        text: "../app/lookup_editor/js/lib/text",
        console: '../app/lookup_editor/js/lib/console'
    },
    shim: {
        'bootstrapDataTables': {
            deps: ['datatables']
        }
    }
});

define([
    "underscore",
    "backbone",
    "models/SplunkDBase",
    "collections/SplunkDsBase",
    "splunkjs/mvc",
    "jquery",
    "splunkjs/mvc/simplesplunkview",
    "text!../app/lookup_editor/js/templates/LookupList.html",
    "bootstrapDataTables",
    "bootstrap.dropdown",
    "css!../app/lookup_editor/css/LookupList.css"
], function(
    _,
    Backbone,
    SplunkDBaseModel,
    SplunkDsBaseCollection,
    mvc,
    $,
    SimpleSplunkView,
    Template,
    dataTable
){
	
	var Apps = SplunkDsBaseCollection.extend({
	    url: "apps/local",
	    //model: CSVLookup,
	    initialize: function() {
	      SplunkDsBaseCollection.prototype.initialize.apply(this, arguments);
	    }
	});
	
	var CSVLookup = SplunkDBaseModel.extend({
		    url: 'data/lookup-table-files', // /servicesNS/' + user + '/' + app + '/data/lookup-table-files'
		    initialize: function() {
		      SplunkDBaseModel.prototype.initialize.apply(this, arguments);
		    }
	});
	
	var CSVLookups = SplunkDsBaseCollection.extend({
		    url: 'data/lookup-table-files',
		    //model: CSVLookup,
		    initialize: function() {
		      SplunkDsBaseCollection.prototype.initialize.apply(this, arguments);
		    }
	});
	
    // Define the custom view class
    var LookupListView = SimpleSplunkView.extend({
        className: "LookupListView",
        
        defaults: {
        	change_dropdown_titles: true
        },
        
        /**
         * Initialize the class.
         */
        initialize: function() {
        	this.options = _.extend({}, this.defaults, this.options);
        	
        	// Save the options
        	this.change_dropdown_titles = this.options.change_dropdown_titles;
        	
            // Filtering options
            this.filter_app = null;
            this.filter_type = null;
            this.apps = null;
            
            // The reference to the data-table
            this.data_table = null;
        	
        	// Get the lookups
        	this.csv_lookups = new CSVLookups();
        	this.csv_lookups.on('reset', this.gotCSVLookups.bind(this), this);
        	
        	this.csv_lookups.fetch({
                success: function() {
                  console.info("Successfully retrieved the lookup files");
                },
                error: function() {
                  console.error("Unable to fetch the lookup files");
                }
            });
        	
        	// Get the apps
        	this.apps = new Apps();
        	this.apps.on('reset', this.gotApps.bind(this), this);
        	
        	this.apps.fetch({
                success: function() {
                  console.info("Successfully retrieved the list of applications");
                },
                error: function() {
                  console.error("Unable to fetch the apps");
                }
            });
        },
        
        events: {
        	// Filtering
        	"click .type-filter > .dropdown-menu > li > a" : "setTypeFilter",
        	"click .app-filter > .dropdown-menu > li > a" : "setAppFilter",
        	"change #free-text-filter" : "applyFilter",
        	"keyup #free-text-filter" : "goFilter",
        	"keypress #free-text-filter" : "goFilter",
        },
        
        /**
         * Set the name associated with the filter
         */
        setFilterText: function(filter_name, prefix, appendix){
        	
        	if (typeof appendix === "undefined") {
        		appendix = "All";
        	}
        	
    		if(this.change_dropdown_titles){
    			
    			if(appendix){
    				$("." + filter_name + " > .dropdown-toggle").html(prefix + ': ' + appendix + '<span class="caret"></span>');
    			}
    			else{
    				$("." + filter_name + " > .dropdown-toggle").html(prefix + '<span class="caret"></span>');
    			}
    			
    		}
        },
        
        /**
         * Set the type filter
         */
        setTypeFilter: function(ev){
        	var filter = $(ev.target).text();
        	
        	if(filter === "All"){
        		this.filter_type = null;
        	}
        	else{
        		this.filter_type = filter;
        	}
        	
        	this.setFilterText('type-filter', 'Type', filter);
        	
        	// Remove the checked icon from any existing entries
        	$('.type-filter > .dropdown-menu > li > a > i').addClass('hide');
        	  
        	// Show the checked icon on this entry
        	$('i', ev.currentTarget).removeClass('hide');
        	
        	this.applyFilter();
        	
        },
        
        /**
         * Set the app filter
         */
        setAppFilter: function(ev){
        	var filter = $(ev.target).text();
        	
        	if(filter === "All"){
        		this.filter_app = null;
        	}
        	else{
        		this.filter_app = filter;
        	}
        	
        	this.setFilterText('app-filter', 'App', filter);
        	
        	// Remove the checked icon from any existing entries
        	$('.app-filter > .dropdown-menu > li > a > i').addClass('hide');
        	  
        	// Show the checked icon on this entry
        	$('i', ev.currentTarget).removeClass('hide');
        	
        	this.applyFilter();
        	
        },
        
        /**
         * Apply a filter to the table
         */
        goFilter: function(ev){
        	
        	var code = ev.keyCode || ev.which;
        	
            if (code == 13){
            	ev.preventDefault();
            }
        	
        	this.applyFilter();
        },
        
        /**
         * Apply a filter to the table
         */
        applyFilter: function(){
        	
        	// Get the type filter
        	if( this.filter_type !== null ){
        		this.data_table.columns(1).search( "^" + this.filter_type + "$", true );
        	}
        	else{
        		this.data_table.columns(1).search( "" );
        	}
        	
        	// Get the app filter
        	if( this.filter_app !== null ){
        		this.data_table.columns(2).search( "^" + this.filter_app + "$", true );
        	}
        	else{
        		this.data_table.columns(2).search( "" );
        	}
        	
        	// Apply the filter
        	this.data_table.columns(0).search( $('#free-text-filter').val() ).draw();
        },
        
        /**
         * Get the description for the app name
         */
        getAppDescriptionFromName: function(name){
        	
    		for(var c = 0; c < this.apps.models.length; c++){
    			
    			if(this.apps.models[c].entry.attributes.name === name){
    				return this.apps.models[c].entry.associated.content.attributes.label;
    			}
    			
    		}
    		
    		return name;
        	
        },
        
        /**
         * Get the CSV lookups
         */
        gotCSVLookups: function(){
        	this.renderLookupsList();
        },
        
        /**
         * Get the apps
         */
        gotApps: function(){
        	this.renderLookupsList();
        },
        
        /**
         * Determine if the string end with a sub-string.
         */
        endsWith: function(str, suffix) {
            return str.indexOf(suffix, str.length - suffix.length) !== -1;
        },
        
        /**
         * Determine if the lookup a supported one
         */
        isSupportedLookup: function(lookup){
        	
        	if(this.endsWith(lookup.name, ".default")){
        		return false;
        	}
        	
        	else if(lookup.name === ".DS_Store"){
        		return false;
        	}
        	
        	else{
        		return true
        	}
        	
        },
        
        /**
         * Get the lookups list in JSON format
         */
        getCSVLookupsJSON: function(){
        	
        	var lookups_json = [];
        	var new_entry = null;
        	
        	for(var c = 0; c < this.csv_lookups.models.length; c++){
        		
        		new_entry = {
        				'name': this.csv_lookups.models[c].entry.attributes.name,
        				'author': this.csv_lookups.models[c].entry.attributes.author,
        				'updated': this.csv_lookups.models[c].entry.attributes.updated,
        				'namespace': this.csv_lookups.models[c].entry.acl.attributes.app,
        				'owner': this.csv_lookups.models[c].entry.acl.attributes.owner
        				
        		};
        		
        		lookups_json.push(new_entry);
        	}
        	
        	return lookups_json.filter(this.isSupportedLookup.bind(this));
        },
        
        /**
         * Get the apps list in JSON format
         */
        getAppsJSON: function(only_include_those_with_lookups){
        	
        	// Set a default for the parameter
        	if (typeof only_include_those_with_lookups === "undefined") {
        		only_include_those_with_lookups = true;
        	}
        	
        	// If we don't have the apps yet, then just return an empty list for now
        	if(!this.apps){
        		return [];
        	}
        	
        	var apps_json = [];
        	var new_entry = null;
        	
        	for(var c = 0; c < this.apps.models.length; c++){
        		
        		new_entry = {
        				'name': this.apps.models[c].entry.attributes.name,
        				'label': this.apps.models[c].entry.associated.content.attributes.label
        		};
        		
        		// Filter out the items that are not for an app that exposes a lookup
        		if(only_include_those_with_lookups){
	        		// Find out of the item is for an app that publishes a lookup
	        		for(var d = 0; d < this.csv_lookups.models.length; d++){
	        			
	        			if(this.csv_lookups.models[d].entry.acl.attributes.app === this.apps.models[c].entry.attributes.name){
	        				apps_json.push(new_entry);
	        				break;
	        			}
	        			
	        		}
        		}
        		
        		// Otherwise, just include all of them
        		else{
        			apps_json.push(new_entry);
        		}
        		
        	}
        	
        	return apps_json;
        },
        
        /**
         * Render the list of lookups.
         */
        renderLookupsList: function(){
        	
        	// Get the template
            var lookup_list_template = $('#lookup-list-template', this.$el).text();
            
        	$('#content', this.$el).html(_.template(lookup_list_template, {
        		'csv_lookups' : this.getCSVLookupsJSON(),
        		'apps' : this.getAppsJSON(),
        		'getAppDescriptionFromName' : this.getAppDescriptionFromName.bind(this)
        	}));
        	
            // Make the table filterable, sortable and paginated with data-tables
            this.data_table = $('#table', this.$el).DataTable( {
                "iDisplayLength": 25,
                "bLengthChange": false,
                "searching": true,
                "aLengthMenu": [[ 25, 50, 100, -1], [25, 50, 100, "All"]],
                "bStateSave": false,
                "aaSorting": [[ 1, "asc" ]],
                "aoColumns": [
                              null,                   // Name
                              null,                   // Type
                              null,                   // App
                              null,                   // Owner
                              { "bSortable": false }  // Actions
                            ]
            } );
            
            // Update the filter text
            this.setFilterText('type-filter', 'Type');
            this.setFilterText('app-filter', 'App');
        },
        
        /**
         * Render the page.
         */
        render: function () {
        	this.$el.html(Template);
        }
    });
    
    return LookupListView;
});