
require.config({
    paths: {
    	Handsontable: "../app/lookup_editor/js/lib/jquery.handsontable.full",
        text: "../app/lookup_editor/js/lib/text",
        console: '../app/lookup_editor/js/lib/console',
        csv: '../app/lookup_editor/js/lib/csv'
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
    "csv",
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
	    url: "apps/local",
	    initialize: function() {
	      SplunkDsBaseCollection.prototype.initialize.apply(this, arguments);
	    }
	});
	
	var Backup = Backbone.Model.extend();
	
	var Backups = Backbone.Collection.extend({
	    url: Splunk.util.make_full_url("/custom/lookup_editor/lookup_edit/get_lookup_backups_list"),
	    model: Backup
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
            this.backups = null;
            
            // The information for the loaded lookup
            this.lookup = null;
            this.namespace = null;
            this.owner = null;
            
        },
        
        events: {
        	// Filtering
        	"click #save" : "doSaveLookup",
        	"click .backup-version" : "doLoadBackup",
        	"dragover" : "onDragFile",
        	//"dragenter" : "onDragFileEnter",
        	//"dragleave": "onDragFileEnd",
        	"drop" : "onDropFile" //        	"drop .lookup-table" : "onDropFile",
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
        	if( typeof version == 'undefined' ){
        		version = null;
        	}
        	
        	var r = confirm('This version the lookup file will now be loaded.\n\nUnsaved changes will be overridden.');
        	
        	if (r == true) {
        		this.loadLookupContents(this.lookup, this.namespace, this.owner, false, version);
        		return true;
        	}
        	else{
        		return false;
        	}
        },

        /**
         * Hide the dialogs.
         */
        hideDialogs: function(){
        	$("#warning-dialog", this.$el).hide();
        	$("#info-dialog", this.$el).hide();
        },
        
        /**
         * Show a warning noting that something bad happened.
         */
        showWarningDialog: function(message, hide_editor){
        	
        	// Load a default for the hide_editor argument
        	if(typeof hide_editor == 'undefined'){
        		hide_editor = false;
        	}
        	
        	$("#warning-dialog > .message", this.$el).text(message);
        	$("#warning-dialog", this.$el).show();
        	
        	if(hide_editor){
        		$(".editing-content", this.$el).hide();
        	}
        },
        
        /**
         * Show a warning noting that something bad happened.
         */
        showInfoDialog: function(message){
        	$("#info-dialog > .message", this.$el).text(message);
        	$("#info-dialog", this.$el).show();
        },
        
        /**
         * Load the list of backup lookup files.
         * 
         * @param lookup_file The name of the lookup file
         * @param namespace The app where the lookup file exists
         * @param user The user that owns the file (in the case of user-based lookups)
         */
        loadLookupBackupsList: function(lookup_file, namespace, user){
        	
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
        	
        	// Fetch them
        	this.backups = new Backups();
        	this.backups.fetch({
        		data: $.param(data),
        		success: this.renderBackupsList.bind(this)
        	});
        	
        },
        
        onDragFile: function(evt){
        	evt.stopPropagation();
            evt.preventDefault();
            evt.dataTransfer.dropEffect = 'copy'; // Make it clear this is a copy
            
        	//this.$el.addClass('dragging');
        	console.log("Dragging...")
        },
        
        onDragFileEnter: function(evt){
        	evt.preventDefault();
        	return false;
        },
        
        onDragFileEnd: function(){
        	console.log("Dragging stopped")
        	this.$el.removeClass('dragging');
        },
        
        /**
         * Import the dropped file.
         */
        onDropFile: function(evt){
        	
        	console.log("Got a file via drag and drop");
        	
        	// Stop the browser from just re-downloading the file
        	evt.stopPropagation();
        	evt.preventDefault();
        	var files = evt.dataTransfer.files; 
        	return;
        	debugger;
        	evt.dataTransfer.files;
        	
        	// Stop if the browser doesn't support processing files in Javascript
        	if(!window.FileReader){
        		alert("Your browser doesn't support file reading in Javascript; thus, I cannot parse your uploaded file");
        		return false;
        	}
        	
        	// Get a reader so that we can read in the file
        	var reader = new FileReader();
        	
        	// Setup an onload handler that will process the file
        	reader.onload = function(evt) {
        		
        		console.log("Running file reader onload handler");
        		
        		// Stop if the ready state isn't "loaded"
                if(evt.target.readyState != 2){
                	return;
                }
                
                // Stop if the file could not be processed
                if(evt.target.error) {
                	
                	// Hide the loading message
                	$(".table-loading-message").hide();
                	
                	// Show an error
                	this.
                    alert('Error while reading file');
                    return;
                }
                
                // Get the file contents
                var filecontent = evt.target.result;
                
                // Import the file into the view
            	var data = new CSV(filecontent, { }).parse();
        		setupTable(data);
        	}.bind(this);
        	
            // Stop if no files where provided (user likely pressed cancel)
            if( evt.target.files.length > 0 ){
        	    
        	    // Set the file name if this is a new file and a filename was not set yet
            	/*
        	    if( $('#lookup_file_input').length > 0 && $('#lookup_file_input').val().length === 0 ){
        	    	$('#lookup_file_input').val( evt.target.files[0].name );
        	    }
        	    */
        	    
        	    // Start the process of processing file
        	    reader.readAsText(evt.target.files[0]);
            }
            else{
            	// Hide the loading message
            	$(".table-loading-message").hide();
            }
        	
        },
        
        /**
         * Render the list of backup files.
         */
        renderBackupsList: function(){
        	
        	var backup_list_template = '<a class="btn btn-primary dropdown-toggle" data-toggle="dropdown" href="#"> \
        			Revert to previous version \
        			<span class="caret"></span> \
        		</a> \
        		<ul class="dropdown-menu" style="width: 220px;margin-left: -38px;margin-top: 2px;"> \
        		<% for(var c = 0; c < backups.length; c++){ %> \
        			<li><a class="backup-version" href="#" data-backup-time="<%- backups[c].time %>"><%- backups[c].time_readable %></a></li> \
        		<% } %> \
        	</ul>';
        	
        	// Render the list of backups
        	$('#load-backup', this.$el).html(_.template(backup_list_template, {
        		'backups' : this.backups.toJSON()
        	}));
        	
        	// Show the list of backup lookups
        	$('#load-backup', this.$el).show();
        	
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
        	if( typeof header_only == 'undefined' ){
        		header_only = false;
        	}
        	
        	var data = {"lookup_file":lookup_file,
                    	"namespace":namespace,
                    	"header_only":header_only};
        	
        	// Set a default value for version
        	if( typeof version == 'undefined' ){
        		version = undefined;
        	}
        	
        	// Show the loading message
        	$(".table-loading-message").show(); // TODO replace
        	
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
        				  this.showWarningDialog("The requested lookup file does not exist", true);
        			  }
        			  else if( jqXHR.status == 403){
        				  console.info('Inadequate permissions');
        				  this.showWarningDialog("You do not have permission to view this lookup file", true);
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
        				  this.showWarningDialog("The lookup could not be loaded from the server", true);
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
         * Set the title of the save button
         */
        setSaveButtonTitle: function(title){
        	
        	if(typeof title == 'undefined' ){
        		$("#save").text("Save Lookup");
        	}
        	else{
        		$("#save").text(title);
        	}
        	
        },
        
        /**
         * Load the selected backup.
         */
        doLoadBackup: function(evt){
        	var version = evt.currentTarget.dataset.backupTime;
        	this.loadBackupFile(version);
        },
        
        /**
         * Perform the operation to save the lookup
         * 
         * @returns {Boolean}
         */
        doSaveLookup: function(evt){
        	
        	// Determine if we are making a new entry
        	var making_new_lookup = false;
        	
        	// Change the title
        	this.setSaveButtonTitle("Saving...");
        	
        	// Started recording the time so that we figure out how long it took to save the lookup file
        	var populateStart = new Date().getTime();
        	
        	// Get a reference to the handsontable plugin
        	var handsontable = $("#lookup-table").data('handsontable');
        	
        	// Get the row data
        	row_data = handsontable.getData();
        	
        	// Convert the data to JSON
        	json = JSON.stringify(row_data);
        	
        	// Make the arguments
        	var data = {
        			lookup_file : this.lookup,
        			namespace   : this.namespace,
        			contents    : json
        	};

        	// If a user was defined, then pass the name as a parameter
        	if(this.owner !== null){
        		data["owner"] = this.owner;
        	}
        	
        	// Hide the warnings. We will repost them if the input is still invalid
        	this.hideDialogs();
        	
        	// Validate the input if it is new
        	if( making_new_lookup ){
        		
	        	// Get the lookup file name from the form if we are making a new lookup
	        	if (data["lookup_file"] === ""|| data["lookup_file"] === null){
	        		data["lookup_file"] = $("#lookup_file_input").val();
	        	}
	
	        	// Make sure that the file name was included; stop if it was not
	        	if (data["lookup_file"] === ""){
	        		$("#lookup_file_error").text("Please define a file name");
	        		$("#lookup_file_error").show();
	        		this.setSaveButtonTitle();
	        		return false;
	        	}
	        	
	        	// Make sure that the file name is valid; stop if it is not
	        	if( !data["lookup_file"].match(/^[-A-Z0-9_ ]+([.][-A-Z0-9_ ]+)*$/gi) ){
	        		$("#lookup_file_error").text("The file name contains invalid characters");
	        		$("#lookup_file_error").show();
	        		this.setSaveButtonTitle();
	        		return false;
	        	}
	        		
	        	// Get the namespace from the form if we are making a new lookup
	        	if (data["namespace"] === "" || data["namespace"] === null){
	        		data["namespace"] = $("#lookup_file_namespace").val();
	        	}
	
	        	// Make sure that the namespace was included; stop if it was not
	        	if (data["namespace"] === ""){
	        		$("#lookup_namespace_error").text("Please define a namespace");
	        		$("#lookup_namespace_error").show();
	        		this.setSaveButtonTitle();
	        		return false;
	        	}
	        }

        	// Make sure at least a header exists; stop if not enough content is present
        	if(row_data.length === 0){		
        		this.showWarningDialog("Lookup files must contain at least one row (the header)");
        		//loadLookupContents( lookup_file, namespace, user, true );
        		return false;
        	}
        	
        	// Make sure the headers are not empty.
        	// If the editor is allowed to add extra columns then ignore the last row since this for adding a new column thus is allowed
        	for( i = 0; i < row_data[0].length; i++){
        		
        		// Determine if this row has an empty header cell
        		if( row_data[0][i] === "" ){
        			this.showWarningDialog("Header rows cannot contain empty cells (column " + (i + 1) + " of the header is empty)");
        			return false;
        		}
        	}
        	
        	// Perform the request to save the lookups
        	$.ajax( {
        				url:  Splunk.util.make_url('/custom/lookup_editor/lookup_edit/save'),
        				type: 'POST',
        				data: data,
        				
        				success: function(){
        					console.log("Lookup file saved successfully");
        					this.showInfoDialog("Lookup file saved successfully");
        					this.setSaveButtonTitle();
        				}.bind(this),
        				
        				// Handle cases where the file could not be found or the user did not have permissions
        				complete: function(jqXHR, textStatus){
        					
        					var elapsed = new Date().getTime()-populateStart;
        					console.info("Lookup save operation completed in " + elapsed + "ms");
        					var success = true;
        					
        					if(jqXHR.status == 404){
        						console.info('Lookup file was not found');
        						this.showWarningDialog("This lookup file could not be found");
        						success = false;
        					}
        					else if(jqXHR.status == 403){
        						console.info('Inadequate permissions');
        						this.showWarningDialog("You do not have permission to edit this lookup file");
        						success = false;
        					}
        					else if(jqXHR.status == 400){
        						console.info('Invalid input');
        						this.showWarningDialog("This lookup file could not be saved because the input is invalid");
        						success = false;
        					}
        					else if(jqXHR.status == 500){
        						this.showWarningDialog("The lookup file could not be saved");
        				    	success = false;
        					}
        					
        					this.setSaveButtonTitle();
        					
        					// Update the lookup backup list
        					if(success){
        						// loadLookupBackupsList(lookup_file, namespace, user); // TODO
        					}
        				}.bind(this),
        				
        				error: function(jqXHR,textStatus,errorThrown) {
        					console.log("Lookup file not saved");
        					this.showWarningDialog("Lookup file could not be saved");
        				}.bind(this)
        				
        			}
        	);
        	
        	return false;
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
        	
        	// Get the information from the lookup to load
        	this.lookup = this.getParameterByName("lookup");
        	this.namespace = this.getParameterByName("namespace");
        	this.owner = this.getParameterByName("owner");
        	
        	// Load the lookup
        	this.loadLookupContents(this.lookup, this.namespace, this.owner);
        	
        	$(".LookupEditView").on("drop", function(event, ui){this.onDropFile();}.bind(this));
        }
    });
    
    return LookupEditView;
});