
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
    "splunkjs/mvc/simpleform/input/text",
    "splunkjs/mvc/simpleform/input/dropdown",
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
    TextInput,
    DropdownInput,
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
        	
            this.backups = null;
            
            // The information for the loaded lookup
            this.lookup = null;
            this.namespace = null;
            this.owner = null;
            
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
        	
        	this.is_new = true;
        },
        
        events: {
        	// Filtering
        	"click #save" : "doSaveLookup",
        	"click .backup-version" : "doLoadBackup",
        	"click #choose-import-file" : "chooseImportFile",
        	"click #import-file" : "openFileImportModal",
        	"change #import-file-input" : "importFile",
        	//"dragover #drop-zone" : "onDragFile",
        	"dragenter #lookup-table" : "onDragFileEnter",
        	"dragleave #lookup-table": "onDragFileEnd",
        	//"dragenter #drop-zone" : "onDragFileEnter",
        	//"dragenter #drop-zone" : "onDragFileEnd",
        	//"drop #drop-zone" : "onDropFile"
        },
        
        /**
         * For some reason the backbone handlers don't work.
         */
        setupDragDropHandlers: function(){
        	
        	var drop_zone = document.getElementById('lookup-table');
        	
        	this.setupDragDropHandlerOnElement(drop_zone);
        	
        	drop_zone = document.getElementsByClassName("modal-backdrop")[0];
        	
        	this.setupDragDropHandlerOnElement(drop_zone);
        	
        },
        
        setupDragDropHandlerOnElement: function(drop_zone){
        	
        	drop_zone.ondragover = function (e) {
        		e.preventDefault();
        		e.dataTransfer.dropEffect = 'copy';
        	}.bind(this);
        	
        	drop_zone.ondrop = function (e) {
        	      e.preventDefault();
        	      this.onDropFile(e);
        	      return false;
        	}.bind(this);
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
         * Open the modal for importing a file.
         */
        openFileImportModal: function(){
        	$('#import-file-modal', this.$el).modal();
        },
        
        /**
         * Open the file dialog to select a file to import.
         */
        chooseImportFile: function(){
        	$("#import-file-input").click();
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
        },
        
        onDragFileEnter: function(evt){
        	evt.preventDefault();
        	//$('#drop-zone', this.$el).show();
        	//$('#drop-zone', this.$el).height($('#lookup-table', this.$el).height());
        	//$('#lookup-table', this.$el).addClass('drop-target');
        	return false;
        },
        
        onDragFileEnd: function(){
        	console.log("Dragging stopped");
        	this.$el.removeClass('dragging');
        },
        
        /**
         * Import the dropped file.
         */
        onDropFile: function(evt){
        	
        	console.log("Got a file via drag and drop");
        	evt.stopPropagation();
            evt.preventDefault();
            var files = evt.dataTransfer.files;
            
            this.importFile(evt);
        },
        
        /**
         * Import the given file into the lookup.
         */
        importFile: function(evt){
        	
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
                	// TODO
                    alert('Error while reading file');
                    return;
                }
                
                // Get the file contents
                var filecontent = evt.target.result;
                
                // Import the file into the view
            	var data = new CSV(filecontent, { }).parse();
            	
            	// Render the lookup file
            	this.renderLookup(data);
            	
            	// Hide the import dialog
            	$('#import-file-modal', this.$el).modal('hide');
            	
        	}.bind(this);
        	
        	var files = [];
        	
        	// Get the files from the file input widget if available
        	if(evt.target.files && evt.target.files.length > 0){
        		files = evt.target.files;
        	}
        	
        	// Get the files from the drag & drop if available
        	else if(evt.dataTransfer && evt.dataTransfer.files.length > 0){
        		files = evt.dataTransfer.files;
        	}
        	
            // Stop if no files where provided (user likely pressed cancel)
            if(files.length > 0 ){
        	    
        	    // Set the file name if this is a new file and a filename was not set yet
            	// TODO
            	/*
        	    if( $('#lookup_file_input').length > 0 && $('#lookup_file_input').val().length === 0 ){
        	    	$('#lookup_file_input').val( evt.target.files[0].name );
        	    }
        	    */
        	    
        	    // Start the process of processing file
        	    reader.readAsText(files[0]);
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
        	
        	var backup_list_template = '<a class="btn active btn-primary dropdown-toggle" data-toggle="dropdown" href="#"> \
        			Revert to previous version \
        			<span class="caret"></span> \
        		</a> \
        		<ul class="dropdown-menu"> \
        		<% for(var c = 0; c < backups.length; c++){ %> \
        			<li><a class="backup-version" href="#" data-backup-time="<%- backups[c].time %>"><%- backups[c].time_readable %></a></li> \
        		<% } %> \
        		<% if(backups.length == 0){ %> \
        			<li><a class="backup-version" href="#">No backup versions available</a></li> \
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
        			  this.renderLookup(data);
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
         * Get the list of apps as choices.
         */
        getAppsChoices: function(){
        	
        	// If we don't have the apps yet, then just return an empty list for now
        	if(!this.apps){
        		return [];
        	}
        	
        	var choices = [];
        	
        	for(var c = 0; c < this.apps.models.length; c++){
        		choices.push({
        			'label': this.apps.models[c].entry.associated.content.attributes.label,
        			'value': this.apps.models[c].entry.attributes.name
        		});
        	}
        	
        	return choices;
        	
        },
        
        /**
         * Get the apps
         */
        gotApps: function(){
        	console.log("Got the apps!!");
        	
        	// Update the list
        	if(mvc.Components.getInstance("lookup-app")){
        		mvc.Components.getInstance("lookup-app").settings.set("choices", this.getAppsChoices());
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
        	
        	if(version){
        		this.loadBackupFile(version);
        	}
        	
        },
        
        /**
         * Perform the operation to save the lookup
         * 
         * @returns {Boolean}
         */
        doSaveLookup: function(evt){
        	
        	// Determine if we are making a new entry
        	var making_new_lookup = this.is_new;
        	
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
        		data["lookup_file"] = mvc.Components.getInstance("lookup-name").val();
	
	        	// Make sure that the file name was included; stop if it was not
	        	if (data["lookup_file"] === ""){
	        		$("#lookup_file_error").text("Please define a file name"); // TODO
	        		$("#lookup_file_error").show();
	        		this.setSaveButtonTitle();
	        		return false;
	        	}
	        	
	        	// Make sure that the file name is valid; stop if it is not
	        	if( !data["lookup_file"].match(/^[-A-Z0-9_ ]+([.][-A-Z0-9_ ]+)*$/gi) ){
	        		$("#lookup_file_error").text("The file name contains invalid characters"); // TODO
	        		$("#lookup_file_error").show();
	        		this.setSaveButtonTitle();
	        		return false;
	        	}
	        		
	        	// Get the namespace from the form if we are making a new lookup
	        	data["namespace"] = mvc.Components.getInstance("lookup-app").val();
	
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
        	
        	// Get the information from the lookup to load
        	this.lookup = this.getParameterByName("lookup");
        	this.namespace = this.getParameterByName("namespace");
        	this.owner = this.getParameterByName("owner");
        	
        	this.is_new = false;
        	
        	// Determine if we are making a new lookup
        	if(this.lookup == "" && this.namespace == "" && this.owner == ""){
        		this.is_new = true;
        	}
        	
        	// Render
        	this.$el.html(_.template(Template, {
        		'insufficient_permissions' : false,
        		'is_new' : this.is_new
        	}));
        	
            // Show the content that is specific to making new lookups
        	if(this.is_new){
        		
	        	// Make the lookup name input
	        	var name_input = new TextInput({
	                "id": "lookup-name",
	                "searchWhenChanged": false,
	                "el": $('#lookup-name', this.$el)
	            }, {tokens: true}).render();
        		
	        	name_input.on("change", function(newValue) {
                	this.validateForm();
                }.bind(this));
        		
	        	// Make the app selection drop-down
                var app_dropdown = new DropdownInput({
                    "id": "lookup-app",
                    "selectFirstChoice": false,
                    "showClearButton": false,
                    "el": $('#lookup-app', this.$el),
                    "choices": this.getAppsChoices()
                }, {tokens: true}).render();
                
                app_dropdown.on("change", function(newValue) {
                	this.validateForm();
                }.bind(this));
        	}

        	// Setup the handlers so that we can make the view support drag and drop
            this.setupDragDropHandlers();
            
        	// Set the window height so that the user doesn't have to scroll to the bottom to set the save button
        	$('#lookup-table').height($(window).height() - 320);
        	
        	// Show a default lookup if this is a new lookup
        	if(this.is_new){
        		
        		var data = [
        		            ["Column1", "Column2", "Column3", "Column4", "Column5", "Column6"],
        		            ["", "", "", "", "", ""],
        		            ["", "", "", "", "", ""],
        		            ["", "", "", "", "", ""],
        		            ["", "", "", "", "", ""]
        		          ];
        		
        		this.renderLookup(data);
        	}
        	
        	// Stop if we didn't get enough information to load a lookup
        	else if(this.lookup == "" || this.namespace == "" || this.owner == ""){
        		this.showWarningDialog("Not enough information to identify the lookup file to load");
        	}
        	
        	// Load the lookup
        	else{
        		this.loadLookupContents(this.lookup, this.namespace, this.owner);
        	}
        	
        }
    });
    
    return LookupEditView;
});