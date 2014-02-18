/**
 * Copyright (C) 2009-2014 Splunk Inc. All Rights Reserved.
 */

/**
 * Show a warning dialog.
 * 
 * @param text The message to be displayed
 */
function showWarningDialog(text){
	$("#warning_dialog_text").text(text);
	$("#warning_dialog").show();
}

/**
 * Validate that the lookup contents are a valid file
 * 
 * @param data The data (array of array) representing the table
 * @returns {Boolean}
 */
function validate (data) {
	
	// If the cell is the first row, then ensure that the new value is not blank
	if( data[0][0] === 0 && data[0][3].length === 0 ){
		return false;
	}
}

/**
 * A renderer for lookup file contents.
 * 
 * @param instance
 * @param td
 * @param row
 * @param col
 * @param prop
 * @param value
 * @param cellProperties
 */
function lookupRenderer(instance, td, row, col, prop, value, cellProperties) {
	
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
	
}

/**
 * Render the given data as a table.
 * 
 * @param data The data (array of array) representing the table
 */
function setupTable( data ){
	
	if (data === null){
		data = [
			["", "", "", ""],
			["", "", "", ""]
		];
	}
	
	new_jquery("#dataTable").handsontable({
	  data: data,
	  startRows: 1,
	  startCols: 1,
	  contextMenu: true,
	  minSpareRows: 0,
	  minSpareCols: 0,
	  colHeaders: false,
	  rowHeaders: true,
	  
	  stretchH: 'all',
	  manualColumnResize: true,
	  manualColumnMove: true,
	  onBeforeChange: validate,
	  
	  cells: function(row, col, prop) {
		  this.renderer = lookupRenderer;
	  },
	
	  // Don't allow removal of all columns
	  afterRemoveCol: function(index, amount){
		  if(this.countCols() == 0){
			  alert("You must have at least one cell to have a valid lookup");
			  //loadLookupContents( lookup_file, namespace, user, true );
			  setupTable( [ [""] ] );
		  }
	  },
	  
	  // Don't allow removal of all rows
	  afterRemoveRow: function(index, amount){
		  if(index == 0){
			  alert("You must have at least one cell to have a valid lookup");
			  setupTable( [ [""] ] );
			  //loadLookupContents( lookup_file, namespace, user, true );
		  }
	  }
	  
	});
}

/**
 * Go to the list page.
 */
function gotoToList(){

	if( $('#returnto').length > 0 && $('#returnto').val() ){
		document.location = $('#returnto').val();
	}
}

/**
 * Get the table contents as an array.
 * 
 * @returns {Array}
 */
function getTableAsJSON(){
	
	var data = [];
	var rows = 0;
	
	$('table.htCore').find('tr:not(:last-child)').each(function(){
		var id = $(this).attr('id');
		var row = [];
		rows = rows + 1;
		
		$(this).find('td:not(:last-child)').each(function(){
			row.push( $(this).text() );
		});

		data.push(row);
	} );

	return data;
}

/**
 * Show a message indicating that the save was completed successfully.
 */
function saveSuccess(){
	console.log("Lookup file saved successfully");

	$("#save > span").text("Save");
	
	var messenger = Splunk.Messenger.System.getInstance();
	messenger.send('info', "splunk.sa_utils", "File successfully updated");
	
	// Return the user to the lookup list
	//gotoToList();
}

/**
 * Save the lookup contents.
 */
function saveLookup(){
	$("#save > span").text("Saving...");
	
	// Use a delay so that the event loop is able to change the button text before the work begins
	setTimeout( doSaveLookup, 100);
}

/**
 * Get a list of apps and populate the namespace selection form.
 */
function getApps(){
	
    $.ajax({
        type: "GET",
        url: Splunk.util.make_url("/splunkd/services/apps/local?output_mode=json&count=-1"),
        async: true,
        success: function(data) {
        	
        	// For each app, add it to the selection box
        	for(var c = 0; c < data.entry.length; c++){
        		
        		// Determine if the app if the lookup editor itself (this will be the default)
        		var selected = "";
        		
        		if(data.entry[c]['name'] == "lookup_editor"){
        			selected = "selected";
        		}
        		
        		// Add the app to the list
        		$('#lookup_file_namespace').append("<option value='" + data.entry[c]['name'] + "' " + selected + ">" + data.entry[c]['content']['label'] + "</option>");
        	}
        }
    });
	
}

// Start populating the list of apps
getApps();

/**
 * Show a dialog indicating that the lookup table contents are invalid.
 * 
 * @param text The text to display describing why the content is invalid.
 */
function showValidationFailureMessage(text){
	$("#item-data-table > div > .widgeterror").text(text);
	$("#item-data-table > div > .widgeterror").show();
	$("#save > span").text("Save");
	alert(text);
}

/**
 * Perform the operation to save the lookup
 * 
 * @returns {Boolean}
 */
function doSaveLookup(){
	
	// Get a reference to the handsontable plugin
	var handsontable = new_jquery("#dataTable").data('handsontable');
	
	// Get the row data
	row_data = handsontable.getData();
	
	// Convert the data to JSON
	json = JSON.stringify(row_data);
	
	// Make the arguments
	var data = {
			lookup_file : lookup_file,
			namespace   : namespace,
			contents    : json
	};

	// If a user was defined, then pass the name as a parameter
	if(user !== null){
		data["owner"] = user;
	}
	
	// Get the lookup file name from the form if we are making a new lookup
	if (data["lookup_file"] === ""|| data["lookup_file"] === null){
		data["lookup_file"] = $("#lookup_file_input").val();
	}

	// Make sure that the file name was included; stop if it was not
	if (data["lookup_file"] === ""){
		$("#lookup_file_namespace_file").text("Please define a file name");
		$("#lookup_file_namespace_file").show();
		$("#save > span").text("Save");
		return false;
	}
	
	// Get the namespace from the form if we are making a new lookup
	if (data["namespace"] === "" || data["namespace"] === null){
		data["namespace"] = $("#lookup_file_namespace").val();
	}

	// Make sure that the namespace was included; stop if it was not
	if (data["namespace"] === ""){
		$("#lookup_file_namespace_error").text("Please define a namespace");
		$("#lookup_file_namespace_error").show();
		$("#save > span").text("Save");
		return false;
	}

	// Make sure at least a header exists; stop if not enough content is present
	if(row_data.length === 0){		
		showValidationFailureMessage("Lookup files must contain at least one row (the header)");
		loadLookupContents( lookup_file, namespace, user, true );
		return false;
	}
	
	// Make sure the headers are not empty.
	// If the editor is allowed to add extra columns then ignore the last row since this for adding a new column thus is allowed
	for( i = 0; i < row_data[0].length; i++){
		
		// Determine if this row has an empty header cell
		if( row_data[0][i] === "" ){
			showValidationFailureMessage("Header rows cannot contain empty cells (column " + (i + 1) + " of the header is empty)");
			return false;
		}
	}
	
	// Perform the request to save the lookups
	$.ajax( Splunk.util.make_url('/custom/lookup_editor/lookup_edit/save'),
			{
				uri:  Splunk.util.make_url('/custom/lookup_editor/lookup_edit/save'),
				type: 'POST',
				data: data,
				
				// Get the Splunk form key
				beforeSend: function(xhr) {
					xhr.setRequestHeader('X-Splunk-Form-Key', $('input[name=splunk_form_key]').val());
				},
				
				success: saveSuccess,
				
				// Handle cases where the file could not be found or the user did not have permissions
				complete: function(jqXHR, textStatus){
					var messenger = Splunk.Messenger.System.getInstance();
					
					if(jqXHR.status == 404){
						console.info('Lookup file was not found');
						messenger.send('error', "splunk.lookup-editor", "This lookup file could not be found");
					}
					else if(jqXHR.status == 403){
						console.info('Inadequate permissions');
						messenger.send('error', "splunk.lookup-editor", "You do not have permission to edit this lookup file");
					}
					else if(jqXHR.status == 500){
				    	messenger.send('error', "splunk.lookup-editor", "The lookup file could not be saved");
					}
					
					$("#save > span").text("Save");
				},
				
				error: function(jqXHR,textStatus,errorThrown) {
					console.log("Lookup file not saved");
				} 
			}
	);
	
	return false;
	
}

/**
 * Show the default content for empty lookups (typically used for new lookup files).
 */
function showDefaultContent(){
	var data = [
	            ["Column1", "Column2", "Column3", "Column4", "Column5", "Column6"],
	            ["", "", "", "", "", ""],
	            ["", "", "", "", "", ""],
	            ["", "", "", "", "", ""],
	            ["", "", "", "", "", ""]
	          ];
	
	setupTable(data);
	$("#tableEditor").show();
	$(".table-loading-message").hide();

}

/**
 * Setup the editor by loading the content from the server or inserting the default content.
 */
function setupView(){
	
	// If this is a new lookup file, then show the form for making a new one
	if(lookup_file == null){
		showDefaultContent();
	}
	else{
		loadLookupContents( lookup_file, namespace, user, false );
	}
}

/**
 * Setup the click handlers for performing operations requested by the user.
 */
function setupHandlers(){
	$("#save").click( saveLookup );
	$("#cancel").click( gotoToList );
	
	// Make sure that the variables that indicate which lookup to load are defined. Don't bother continuing if they weren't.
	if (typeof lookup_file !== 'undefined' && typeof namespace !== 'undefined') {
		
		// Set the data-table width and height so that the editor takes up the entire page
		// We shouldn't have to do this since we should be able to use width of 100%. However, width 100% only works if
		// the parents have widths defined all the way to the top (which they don't).
		$('#dataTable').width( $(document).width() - 100 ) ;
		$('#dataTable').height( $(document).height() - 320 ) ;
		
		// Setup the view. We are going to delay this because we have to swap out the jQuery version and we need to Splunk
		// javascripts to complete first.
		setTimeout(setupView, 300);
	}
}

// When the document is ready, get the handlers configured.
$(document).ready( setupHandlers );

/**
 * Load the lookup file contents from the server and populate the editor.
 * 
 * @param lookup_file The name of the lookup file
 * @param namespace The app where the lookup file exists
 * @param user The user that owns the file (in the case of user-based lookups)
 * @param header_only Indicates if only the header row should be retrieved
 */
function loadLookupContents(lookup_file, namespace, user, header_only){
	
	var data = {"lookup_file":lookup_file,
            	"namespace":namespace,
            	"header_only":header_only};
	
	// If a user was defined, then pass the name as a parameter
	if(user !== null){
		data["owner"] = user;
	}
	
	// Make the URL
    url = Splunk.util.make_full_url("/custom/lookup_editor/lookup_edit/get_lookup_contents", data);
	
    // Switch to the newer version of jquery
	$ = new_jquery;
	
	// Perform the call
	$.ajax({
		  url: url,
		  cache: false,
		  
		  // On success, populate the table
		  success: function(data) {
			  console.info('JSON of lookup table was successfully loaded');
			  setupTable( data );
			  $("#tableEditor").show();
		  },
		  
		  // Handle cases where the file could not be found or the user did not have permissions
		  complete: function(jqXHR, textStatus){
			  if( jqXHR.status == 404){
				  console.info('Lookup file was not found');
				  showWarningDialog("The requested lookup file does not exist");
			  }
			  else if( jqXHR.status == 403){
				  console.info('Inadequate permissions');
				  showWarningDialog("You do not have permission to view this lookup file");
			  }
			  
			  // Hide the loading message
			  $(".table-loading-message").hide();
		  },
		  
		  // Handle errors
		  error: function(jqXHR, textStatus, errorThrown){
			  if( jqXHR.status != 404 && jqXHR.status != 403 ){
				  console.info('Lookup file could not be loaded');
				  showWarningDialog("The lookup could not be loaded from the server");
			  }
		  }
	});

	// Switch back to the old version of jQuery
	$ = old_jquery;
}

/**
 * Below is the Javascript class associated with the core editor class.
 */
Splunk.Module.LookupFileEditor = $.klass(Splunk.Module, {
	
    initialize: function($super,container) {
        var retVal = $super(container);
        
    	// Get the name of the view to redirect to and save it so that we can redirect
    	$('#returnto').val( this.getParam('listView') );
        
        // Get a reference to the form
        var formElement = $('form', this.container);
        
        // Update the form call with an Ajax request submission
        formElement.submit(function(e) {
        	
        	// Initiate the Ajax request
            try {
                $(this).ajaxSubmit({
                	
                	// Upon the successful processing of the Ajax request, evaluate the response to determine if the status was created
                    'success': function(json) {
                		var messenger;
                		
                		// If successful, print a message noting that it was successful
                        if (json["success"]) {
                        	
                        	// Print a message noting that the change was successfully made
                        	messenger = Splunk.Messenger.System.getInstance();
                        	messenger.send('info', "splunk.lookup_editor", json["message"]);
                        	
                        // If it was unsuccessful, then print an error message accordingly
                        } else {
                            messenger = Splunk.Messenger.System.getInstance();
                            messenger.send('error', "splunk.lookup_editor", _('ERROR - ') + json["message"] || json);
                        }
                    },
                    'dataType': 'json'
                });
                
            // The Ajax request failed, print an exception
            } catch(e) {
                alert(e);
                showWarningDialog("An exception occurred: " + e);
            }

            return false;

        });
        
        return retVal;
    },
    
    /**
     * Include a stub for handling submissions (which is unused because this module doesn't handle search results)
     */
    handleSubmitCallback: function() {
    	var messenger = Splunk.Messenger.System.getInstance();
    	messenger.send('info', "splunk.lookup_editor", "Action succeeded");
    	
    }
});