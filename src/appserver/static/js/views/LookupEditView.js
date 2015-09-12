
require.config({
    paths: {
    	Handsontable: "../app/lookup_editor/js/lib/jquery.handsontable.full",
        text: "../app/lookup_editor/js/lib/text",
        console: '../app/lookup_editor/js/lib/console'
    },
    shim: {
        'Handsontable': {
            deps: ['jquery']
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
    "text!../app/lookup_editor/js/templates/LookupEdit.html",
    "Handsontable",
    "bootstrap.dropdown",
    "splunk.util",
    "css!../app/lookup_editor/css/LookupEdit.css",
    "css!../app/lookup_editor/css/lib/jquery.handsontable.full.css"
], function(
    _,
    Backbone,
    SplunkDBaseModel,
    SplunkDsBaseCollection,
    mvc,
    $,
    SimpleSplunkView,
    Template
){
	
	var Apps = SplunkDsBaseCollection.extend({
	    uurl: "apps/local",
	    //model: CSVLookup,
	    initialize: function() {
	      SplunkDsBaseCollection.prototype.initialize.apply(this, arguments);
	    }
	});
	
	
    // Define the custom view class
    var LookupEditView = SimpleSplunkView.extend({
        className: "LookupEditView",
        
        defaults: {
        	
        },
        
        /**
         * Initialize the class.
         */
        initialize: function() {
        	this.options = _.extend({}, this.defaults, this.options);
        	
            this.apps = null;
            
        },
        
        events: {
        	// Filtering
        	
        },
        
        /**
         * Cell renderer for HandsOnTable
         */
        lookupRenderer: function(instance, td, row, col, prop, value, cellProperties) {
        	
        	Handsontable.renderers.TextRenderer.apply(this, arguments);

        	if( (!value || value === '') && row === 0) {
        		td.className = 'cellEmptyHeader';
        	}
        	else if(!value || value === '') {
        		td.className = 'cellEmpty';
        	}
        	else if (parseFloat(value) < 0) { //if row contains negative number
        		td.className = 'cellNegative';
        	}
        	else if( String(value).substring(0, 7) == "http://" || String(value).substring(0, 8) == "https://"){
        		td.className = 'cellHREF';
        	}
        	else if (parseFloat(value) > 0) { //if row contains positive number
        		td.className = 'cellPositive';
        	}
        	else if(row === 0) {
        		td.className = 'cellHeader';
        	}
        	else if(value !== null && value.toLowerCase() === 'true') {
        		td.className = 'cellTrue';
        	}
        	else if(value !== null && value.toLowerCase() ==='false') {
        		td.className = 'cellFalse';
        	}
        	else if(value !== null && value.toLowerCase() === 'unknown') {
        		td.className = 'cellUrgencyUnknown';
        	}
        	else if(value !== null && value.toLowerCase() === 'informational') {
        		td.className = 'cellUrgencyInformational';
        	}
        	else if(value !== null && value.toLowerCase() === 'low') {
        		td.className = 'cellUrgencyLow';
        	}
        	else if(value !== null && value.toLowerCase() === 'medium') {
        		td.className = 'cellUrgencyMedium';
        	}
        	else if(value !== null && value.toLowerCase() === 'high') {
        		td.className = 'cellUrgencyHigh';
        	}
        	else if(value !== null && value.toLowerCase() === 'critical') {
        		td.className = 'cellUrgencyCritical';
        	}
        	else {
        		td.className = '';
        	}
        	
        	if(cellProperties.readOnly) {
        	    td.style.opacity = 0.7;
        	}
        	
        },
        
        /**
         * Load the selected lookup from from the history.
         * 
         * @param version The version of the lookup file to load (a value of null will load the latest version)
         */
        loadBackupFile: function(version){
        	
        	// Load a default for the version
        	if( typeof version === 'undefined' ){
        		version = null;
        	}
        	
        	var r = confirm('This version the lookup file will now be loaded.\n\nUnsaved changes will be overridden.');
        	
        	if (r == true) {
        		loadLookupContents(lookup_file, namespace, user, false, version);
        		return true;
        	}
        	else{
        		return false;
        	}
        },

        /**
         * Load the list of backup lookup files.
         * 
         * @param backups A list of the backups
         */
        setupBackupsList: function(backups){
        	
        	// If we have some backups, then populate the select box
        	if(backups.length >= 0){
        		$("#backupsList").html('<select><option value="">Current version</option></select>');
        		
        		for( var c = 0; c < backups.length; c++){
        			$("#backupsList > select").append('<option value="' + backups[c]['time'] + '">' + backups[c]['time_readable'] + '</option>');
        		}
        	}
        	
        	// Setup the handler
        	if( $("#backupsList > select").on ){ // Don't bother if we cannot setup an on handler
        		$("#backupsList > select").on( "change", function() {
        			
        			var version = null;
        			
        			// Assign a default
        			if( this.value ){
        				version = this.value;
        			}
        			
        			// Load the backup version; if that doesn't succeed, then revert the value
        			if( !loadBackupFile(version) ){
        				$(this).val( $(this).data("prev") );
        			}
        			else{
        				// Save the previous value
        				$(this).data("prev", this.value);
        			}
        			
        		});
        		
        		// Show the backups controls
        		$('#backupsControls').fadeIn(100);
        	}
        },

        /**
         * Load the list of backup lookup files.
         * 
         * @param lookup_file The name of the lookup file
         * @param namespace The app where the lookup file exists
         * @param user The user that owns the file (in the case of user-based lookups)
         */
        loadLookupBackupsList: function(lookup_file, namespace, user){
        	
        	return; // TODO: remove
        	
        	var data = {"lookup_file":lookup_file,
                    	"namespace":namespace};
        	
        	// Populate the default parameter in case user wasn't provided
        	if( typeof user === 'undefined' ){
        		user = null;
        	}

        	// If a user was defined, then pass the name as a parameter
        	if(user !== null){
        		data["owner"] = user;
        	}
        	
        	// Make the URL
            url = Splunk.util.make_full_url("/custom/lookup_editor/lookup_edit/get_lookup_backups_list", data);
            
        	// Perform the call
        	$.ajax({
        		  url: url,
        		  cache: false,
        		  
        		  // On success, populate the table
        		  success: function(data) {
        			  console.info('JSON of lookup table backups was successfully loaded');
        			  this.setupBackupsList( data );
        			  $("#backupsList", this.$el).show();
        		  }.bind(this),
        		  
        		  // Handle cases where the file could not be found or the user did not have permissions
        		  complete: function(jqXHR, textStatus){
        			  if( jqXHR.status == 404){
        				  console.info('No backups for this lookup file was found');
        			  }
        			  else if( jqXHR.status == 403){
        				  console.info('Inadequate permissions');
        			  }
        		  }
        	});

        },

        /**
         * Show a warning noting that something bad happened.
         */
        showWarningDialog: function(message){
        	$("#message", this.$el).text(message);
        	$("#warning-dialog", this.$el).show();
        	$(".editing-content", this.$el).hide();
        },
        
        /**
         * Load the lookup file contents from the server and populate the editor.
         * 
         * @param lookup_file The name of the lookup file
         * @param namespace The app where the lookup file exists
         * @param user The user that owns the file (in the case of user-based lookups)
         * @param header_only Indicates if only the header row should be retrieved
         * @param version The version to get from the archived history
         */
        loadLookupContents: function(lookup_file, namespace, user, header_only, version){
        	
        	// Set a default value for header_only
        	if( typeof header_only === 'undefined' ){
        		header_only = false;
        	}
        	
        	var data = {"lookup_file":lookup_file,
                    	"namespace":namespace,
                    	"header_only":header_only};
        	
        	// Set a default value for version
        	if( typeof version === 'undefined' ){
        		version = undefined;
        	}
        	
        	// Show the loading message
        	$(".table-loading-message").show();
        	
        	// Set the version parameter if we are asking for an old version
        	if( version !== undefined && version ){
        		data.version = version;
        	}
        	
        	// If a user was defined, then pass the name as a parameter
        	if(user !== null){
        		data["owner"] = user;
        	}
        	
        	// Make the URL
            url = Splunk.util.make_full_url("/custom/lookup_editor/lookup_edit/get_lookup_contents", data);
        	
        	// Started recording the time so that we figure out how long it took to load the lookup file
        	var populateStart = new Date().getTime();
        	
        	// Perform the call
        	$.ajax({
        		  url: url,
        		  cache: false,
        		  
        		  // On success, populate the table
        		  success: function(data) {
        			  console.info('JSON of lookup table was successfully loaded');
        			  this.renderLookup( data );
        			  $("#tableEditor").show();
        			  
        			  var elapsed = new Date().getTime()-populateStart;
        			  console.info("Lookup loaded and rendered in " + elapsed + "ms");
        		  }.bind(this),
        		  
        		  // Handle cases where the file could not be found or the user did not have permissions
        		  complete: function(jqXHR, textStatus){
        			  if( jqXHR.status == 404){
        				  console.info('Lookup file was not found');
        				  this.showWarningDialog("The requested lookup file does not exist");
        			  }
        			  else if( jqXHR.status == 403){
        				  console.info('Inadequate permissions');
        				  this.showWarningDialog("You do not have permission to view this lookup file");
        			  }
        			  
        			  // Hide the loading message
        			  $(".table-loading-message").hide();
        			  
        			  // Start the loading of the history
        			  if( version === undefined ){
        				  this.loadLookupBackupsList(lookup_file, namespace, user);
        			  }
        			  
        		  }.bind(this),
        		  
        		  // Handle errors
        		  error: function(jqXHR, textStatus, errorThrown){
        			  if( jqXHR.status != 404 && jqXHR.status != 403 ){
        				  console.info('Lookup file could not be loaded');
        				  this.showWarningDialog("The lookup could not be loaded from the server");
        			  }
        		  }.bind(this)
        	});
        },
        
        /**
         * Validate that the lookup contents are a valid file
         * 
         * @param data The data (array of array) representing the table
         * @returns {Boolean}
         */
        validate: function(data) {
        	
        	// If the cell is the first row, then ensure that the new value is not blank
        	if( data[0][0] === 0 && data[0][3].length === 0 ){
        		return false;
        	}
        },
        
        /**
         * Render the lookup.
         */
        renderLookup: function(data){
        	
        	var renderer = this.lookupRenderer.bind(this);
        	
        	$("#lookup-table").handsontable({
        		  data: data,
        		  startRows: 1,
        		  startCols: 1,
        		  contextMenu: true,
        		  minSpareRows: 0,
        		  minSpareCols: 0,
        		  colHeaders: false,
        		  rowHeaders: true,
        		  fixedRowsTop: 1,
        		  
        		  stretchH: 'all',
        		  manualColumnResize: true,
        		  manualColumnMove: true,
        		  onBeforeChange: this.validate.bind(this),
        		  
        		  cells: function(row, col, prop) {
        			  this.renderer = renderer;
        		  },
        		
        		  beforeRemoveRow: function(index, amount){
        			  
        			  // Don't allow deletion of all cells
        			  if( (this.countRows() - amount) <= 0){
        				  alert("A valid lookup file requires at least one row (for the header).");
        				  return false;
        			  }
        			  
        			  // Warn about the header being deleted and make sure the user wants to proceed.
        			  if(index == 0){
        				  var continue_with_deletion = confirm("Are you sure you want to delete the header row?\n\nNote that a valid lookup file needs at least a header.");
        				  
        				  if (!continue_with_deletion){
        					  return false;
        				  }
        			  }
        		  },
        		  
        		  beforeRemoveCol: function(index, amount){
        			  
        			  // Don't allow deletion of all cells
        			  if( (this.countCols() - amount) <= 0){
        				  alert("A valid lookup file requires at least one column.");
        				  return false;
        			  }
        		  },
        		  
        		  // Don't allow removal of all columns
        		  afterRemoveCol: function(index, amount){
        			  if(this.countCols() == 0){
        				  alert("You must have at least one cell to have a valid lookup");
        				  //this.renderLookup( [ [""] ] );
        			  }
        		  }.bind(this)
        		  
        		});
        	
        },
        
        /**
         * Get the parameter with the given name.
         */
        getParameterByName: function(name) {
            name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
            
            var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
                results = regex.exec(location.search);
            
            return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
        },
        
        /**
         * Render the page.
         */
        render: function () {
        	this.$el.html(_.template(Template, {
        		'insufficient_permissions' : false
        	}));
        	
        	// Set the window height so that the user doesn't have to scroll to the bottom to set the save button
        	$('#lookup-table').height($(window).height() - 320);
        	
        	this.renderLookup([ [""] ]);
        	
        	var lookup = this.getParameterByName("lookup");
        	var namespace = this.getParameterByName("namespace");
        	var owner = this.getParameterByName("owner");
        	
        	this.loadLookupContents(lookup, namespace, owner);
        	
        	
        }
    });
    
    return LookupEditView;
});